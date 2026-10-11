import type { Status } from "./db";

const BASE = "https://api.17track.net/track/v2.4";

export function hasApiKey(): boolean {
  return Boolean(process.env.TRACK17_KEY);
}

async function call<T>(endpoint: string, body: unknown): Promise<T> {
  const key = process.env.TRACK17_KEY;
  if (!key) throw new Error("TRACK17_KEY is not set (see .env.local.example)");
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "17token": key },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("17TRACK rate limit hit, try again shortly");
  if (!res.ok) throw new Error(`17TRACK HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; data: T };
  if (json.code !== 0) throw new Error(`17TRACK error code ${json.code}`);
  return json.data;
}

type Item = { number: string; carrier: number };

type RegisterResult = {
  accepted: { number: string; carrier: number }[];
  rejected: { number: string; carrier?: number; error: { code: number; message: string } }[];
};

/** Registers numbers with 17TRACK. Each new number+carrier costs 1 quota. */
export async function register(items: Item[]): Promise<RegisterResult> {
  return call<RegisterResult>("register", items);
}

export type ParsedTrack = {
  number: string;
  carrier: number;
  status: Status;
  detail: string | null;
  lastEventAt: string | null;
  events: { time: string | null; description: string; location: string | null }[];
};

type RawEvent = {
  time_iso?: string;
  time_utc?: string;
  time_raw?: { date?: string; time?: string };
  description?: string;
  location?: string;
};

type TrackInfoResult = {
  accepted: {
    number: string;
    carrier: number;
    track_info?: {
      latest_status?: { status?: string; sub_status?: string };
      latest_event?: RawEvent;
      tracking?: { providers?: { events?: RawEvent[] }[] };
    };
  }[];
  rejected: { number: string; error: { code: number; message: string } }[];
};

export function mapStatus(main?: string, sub?: string): Status {
  if (sub?.startsWith("Exception_Returned")) return "Returned";
  switch (main) {
    case "Delivered":
      return "Delivered";
    case "OutForDelivery":
    case "AvailableForPickup":
      return "Out for Delivery";
    case "InTransit":
      return "In Transit";
    case "InfoReceived":
      return "Created";
    case "DeliveryFailure":
    case "Exception":
    case "Expired":
      return "Exception";
    default:
      return "Pending"; // NotFound or unknown
  }
}

function eventTime(e: RawEvent): string | null {
  if (e.time_iso) return e.time_iso;
  if (e.time_utc) return e.time_utc;
  if (e.time_raw?.date) return `${e.time_raw.date} ${e.time_raw.time ?? ""}`.trim();
  return null;
}

export type TrackOutcome =
  | { ok: true; track: ParsedTrack }
  | { ok: false; number: string; carrier: number; error: string };

export async function getTrackInfo(items: Item[]): Promise<TrackOutcome[]> {
  const data = await call<TrackInfoResult>("gettrackinfo", items);
  const out: TrackOutcome[] = [];
  for (const a of data.accepted ?? []) {
    const ti = a.track_info;
    const events = (ti?.tracking?.providers ?? [])
      .flatMap((p) => p.events ?? [])
      .map((e) => ({
        time: eventTime(e),
        description: e.description ?? "",
        location: e.location || null,
      }))
      .filter((e) => e.description);
    const latest = ti?.latest_event;
    out.push({
      ok: true,
      track: {
        number: a.number,
        carrier: a.carrier,
        status: mapStatus(ti?.latest_status?.status, ti?.latest_status?.sub_status),
        detail: latest?.description ?? events[0]?.description ?? null,
        lastEventAt: latest ? eventTime(latest) : (events[0]?.time ?? null),
        events,
      },
    });
  }
  for (const r of data.rejected ?? []) {
    out.push({ ok: false, number: r.number, carrier: 0, error: r.error.message });
  }
  return out;
}

export type Quota = { total: number; used: number; remain: number };

export async function getQuota(): Promise<Quota | null> {
  if (!hasApiKey()) return null;
  try {
    const d = await call<{ quota_total: number; quota_used: number; quota_remain: number }>(
      "getquota",
      {},
    );
    return { total: d.quota_total, used: d.quota_used, remain: d.quota_remain };
  } catch {
    return null;
  }
}
