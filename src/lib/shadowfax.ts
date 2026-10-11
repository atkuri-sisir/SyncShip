import type { Status } from "./db";
import type { ParsedTrack } from "./track17";

/**
 * Best-effort adapter for Shadowfax's public tracking page (not an official API).
 * It calls the same endpoint tracker.shadowfax.in uses, with the shared token that
 * page ships to every visitor. Shadowfax can change or block this at any time; a
 * failure just shows as a "sync issue" and the parcel can be updated by hand.
 */
const BASE = "https://saruman.shadowfax.in";
const PUBLIC_TRACK_TOKEN =
  process.env.SHADOWFAX_TRACK_TOKEN ??
  "cePcVR7z7FIETB4PxguHC2YJGk6NncHnByrJttgRIUqNxfWezuzAUvtALyqcHJEC";

type SfxResponse = {
  message?: string;
  order_details?: { awb_number?: string; status_id?: string; final_status?: string };
  data?: { main_status?: string; sub_status?: string[]; time?: string[] }[];
};

export function mapShadowfaxStatus(finalStatus: string, statusId: string): Status {
  const t = `${finalStatus} ${statusId}`.toLowerCase().replace(/_/g, " ");
  if (/rto|return/.test(t)) return "Returned";
  if (/undeliver|not deliver|fail|cancel|lost|damage|hold|reject/.test(t)) return "Exception";
  if (/out for delivery|ofd/.test(t)) return "Out for Delivery";
  if (/deliver/.test(t)) return "Delivered";
  if (/pick.?up|picked|manifest|created|placed|assigned|pending/.test(t)) return "Created";
  return "In Transit";
}

function toIso(t: string | undefined): string | null {
  if (!t) return null;
  // Shadowfax sends local India time without a zone
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}+05:30`;
}

export async function trackShadowfax(awb: string): Promise<ParsedTrack> {
  const res = await fetch(`${BASE}/web_app/delivery/track/${encodeURIComponent(awb)}/`, {
    headers: { Authorization: `Token ${PUBLIC_TRACK_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404 || res.status === 400) {
    throw new Error("Shadowfax doesn't recognise this tracking number");
  }
  if (!res.ok) throw new Error(`Shadowfax HTTP ${res.status}`);
  const json = (await res.json()) as SfxResponse;
  if (json.message !== "Success" || !json.order_details) {
    throw new Error(json.message ? `Shadowfax: ${json.message}` : "Unexpected Shadowfax response");
  }

  const events: ParsedTrack["events"] = [];
  for (const group of json.data ?? []) {
    const subs = group.sub_status ?? [];
    const times = group.time ?? [];
    const main = group.main_status ?? "";
    if (subs.length === 0 && main) events.push({ time: toIso(times[0]), description: main, location: null });
    subs.forEach((sub, i) =>
      events.push({ time: toIso(times[i]), description: main ? `${main}: ${sub}` : sub, location: null }),
    );
  }
  events.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

  const finalStatus = json.order_details.final_status ?? "";
  const statusId = json.order_details.status_id ?? "";
  return {
    number: awb,
    carrier: 100102,
    status: mapShadowfaxStatus(finalStatus, statusId),
    detail: finalStatus || events[0]?.description || null,
    lastEventAt: events[0]?.time ?? null,
    events,
  };
}
