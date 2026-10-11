import { getKv, setKv, type Status } from "./db";
import type { ParsedTrack } from "./track17";

/**
 * TrackCourier.io: official tracking API with a free plan (100 requests/month at the
 * time of writing). Covers Delhivery, DTDC, Professional Courier and Speed Post.
 * Docs: https://api.trackcourier.io/docs
 */
const BASE = "https://api.trackcourier.io/v1";

const SLUGS: Record<string, string> = {
  delhivery: "delhivery",
  dtdc: "dtdc",
  professional: "professional",
  speedpost: "speedpost",
  shadowfax: "shadowfax",
};

export function hasTrackCourierKey(): boolean {
  return Boolean(process.env.TRACKCOURIER_KEY);
}

export function supportsTrackCourier(courierKey: string): boolean {
  return courierKey in SLUGS;
}

export type TcUsage = { used: number; quota: number; plan?: string };

export function getTcUsage(): TcUsage | null {
  try {
    const raw = getKv("trackcourier_usage");
    return raw ? (JSON.parse(raw) as TcUsage) : null;
  } catch {
    return null;
  }
}

export class QuotaExceededError extends Error {}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "18-Sep-2026" + "17:08" (India time) -> ISO string with +05:30 */
function toIso(date?: string, time?: string): string | null {
  if (!date) return null;
  const m = /^(\d{1,2})[-\s/]([A-Za-z]{3})[a-z]*[-\s/,]*(\d{4})$/.exec(date.trim());
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  const pad = (n: number | string) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(mon + 1)}-${pad(m[1])}T${pad(t?.[1] ?? 0)}:${pad(t?.[2] ?? 0)}:00+05:30`;
}

export function mapTrackCourierState(state: string | undefined, hasEvents: boolean): Status {
  const s = (state ?? "").toLowerCase().replace(/[^a-z]/g, "");
  switch (s) {
    case "delivered":
      return "Delivered";
    case "outfordelivery":
      return "Out for Delivery";
    case "intransit":
      return "In Transit";
    case "returned":
    case "rto":
      return "Returned";
    case "exception":
    case "cancelled":
    case "canceled":
    case "failed":
      return "Exception";
    case "pending":
      return hasEvents ? "Created" : "Pending";
    default:
      return hasEvents ? "In Transit" : "Pending";
  }
}

type TcResponse = {
  success?: boolean;
  data?: {
    ShipmentState?: string;
    MostRecentStatus?: string;
    CourierHasNoRecordOfShipment?: boolean;
    Checkpoints?: { Activity?: string; Date?: string; Time?: string; Location?: string }[];
  };
  usage?: { used?: number; quota?: number; plan?: string };
  error?: { code?: string; message?: string };
};

const FRIENDLY: Record<string, string> = {
  INVALID_API_KEY: "TrackCourier API key is not valid (check TRACKCOURIER_KEY in .env.local)",
  TRACKING_NOT_FOUND: "The courier has no record of this tracking number yet",
  COURIER_NOT_SUPPORTED: "TrackCourier doesn't support this courier",
  COURIER_NOT_FOUND: "TrackCourier doesn't recognise this courier",
  TIMEOUT: "TrackCourier timed out, try again in a minute",
  SERVICE_ERROR: "TrackCourier had a temporary error, try again in a minute",
};

export async function trackViaTrackCourier(courierKey: string, awb: string): Promise<ParsedTrack> {
  const key = process.env.TRACKCOURIER_KEY;
  if (!key) throw new Error("TRACKCOURIER_KEY is not set (see README)");
  const slug = SLUGS[courierKey];
  if (!slug) throw new Error("This courier isn't supported by TrackCourier");

  const url = `${BASE}/track?courier=${encodeURIComponent(slug)}&tracking_number=${encodeURIComponent(awb)}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  let json: TcResponse = {};
  try {
    json = (await res.json()) as TcResponse;
  } catch {
    /* handled below */
  }

  if (json.usage?.used !== undefined && json.usage.quota !== undefined) {
    setKv(
      "trackcourier_usage",
      JSON.stringify({ used: json.usage.used, quota: json.usage.quota, plan: json.usage.plan }),
    );
  }

  if (!res.ok || json.success === false || !json.data) {
    const code = json.error?.code ?? "";
    if (code === "QUOTA_EXCEEDED" || res.status === 402) {
      throw new QuotaExceededError("TrackCourier monthly free limit reached; it resets on the 1st");
    }
    if (res.status === 429) throw new Error("TrackCourier rate limit hit, try again in a minute");
    throw new Error(FRIENDLY[code] ?? json.error?.message ?? `TrackCourier HTTP ${res.status}`);
  }

  const d = json.data;
  const events = (d.Checkpoints ?? [])
    .map((c) => ({
      time: toIso(c.Date, c.Time),
      description: c.Activity ?? "",
      location: c.Location || null,
    }))
    .filter((e) => e.description)
    .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

  const noRecord = d.CourierHasNoRecordOfShipment === true && events.length === 0;
  return {
    number: awb,
    carrier: 0,
    status: noRecord ? "Pending" : mapTrackCourierState(d.ShipmentState, events.length > 0),
    detail: noRecord ? "Courier has no record yet" : (d.MostRecentStatus ?? events[0]?.description ?? null),
    lastEventAt: events[0]?.time ?? null,
    events,
  };
}
