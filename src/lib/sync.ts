import { db, openShipments, getShipment, type Shipment } from "./db";
import { getCourier } from "./couriers";
import { register, getTrackInfo, hasApiKey, type ParsedTrack } from "./track17";
import { trackShadowfax } from "./shadowfax";
import {
  hasTrackCourierKey,
  supportsTrackCourier,
  trackViaTrackCourier,
  QuotaExceededError,
} from "./trackcourier";

const BATCH = 40;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function applyTrack(s: Shipment, t: ParsedTrack) {
  const d = db();
  d.prepare(
    `UPDATE shipments SET status = ?, status_detail = ?, last_event_at = ?,
       last_synced_at = datetime('now'), last_sync_error = NULL WHERE id = ?`,
  ).run(t.status, t.detail, t.lastEventAt, s.id);
  d.prepare("DELETE FROM events WHERE shipment_id = ?").run(s.id);
  const ins = d.prepare(
    "INSERT INTO events (shipment_id, time, description, location) VALUES (?, ?, ?, ?)",
  );
  for (const e of t.events) ins.run(s.id, e.time, e.description, e.location);
}

function markError(s: Shipment, error: string) {
  db()
    .prepare("UPDATE shipments SET last_sync_error = ?, last_synced_at = datetime('now') WHERE id = ?")
    .run(error, s.id);
}

export type SyncResult = {
  updated: number;
  failed: number;
  /** no automatic route for this courier */
  skipped: number;
  /** held back to save free-plan quota; will be picked up on a later refresh */
  deferred: number;
  errors: string[];
};

/** Shadowfax: direct lookup, one call per parcel, a few at a time. */
async function syncShadowfax(list: Shipment[], result: SyncResult) {
  for (const group of chunk(list, 5)) {
    await Promise.all(
      group.map(async (s) => {
        try {
          applyTrack(s, await trackShadowfax(s.awb));
          result.updated++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          markError(s, msg);
          result.failed++;
          result.errors.push(`${s.awb}: ${msg}`);
        }
      }),
    );
  }
}

/** Other couriers: via the optional 17TRACK key. */
async function sync17(list: Shipment[], result: SyncResult) {
  const usable = list.filter((s) => getCourier(s.courier)?.code);
  const byKey = new Map(usable.map((s) => [`${getCourier(s.courier)!.code}:${s.awb}`, s]));

  for (const batch of chunk(usable, BATCH)) {
    const items = batch.map((s) => ({ number: s.awb, carrier: getCourier(s.courier)!.code! }));

    // Registration: only new numbers cost quota; "already registered" is fine.
    const unregistered = batch.filter((s) => !s.last_synced_at);
    if (unregistered.length) {
      const reg = await register(
        unregistered.map((s) => ({ number: s.awb, carrier: getCourier(s.courier)!.code! })),
      );
      for (const r of reg.rejected ?? []) {
        if (!/regist/i.test(r.error.message)) {
          const s = unregistered.find((u) => u.awb === r.number);
          if (s) {
            markError(s, r.error.message);
            result.failed++;
            result.errors.push(`${r.number}: ${r.error.message}`);
          }
        }
      }
    }

    const outcomes = await getTrackInfo(items);
    for (const o of outcomes) {
      if (o.ok) {
        const s = byKey.get(`${o.track.carrier}:${o.track.number}`);
        if (s) {
          applyTrack(s, o.track);
          result.updated++;
        }
      } else {
        const s = batch.find((b) => b.awb === o.number);
        if (s) {
          markError(s, o.error);
          result.failed++;
          result.errors.push(`${o.number}: ${o.error}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400)); // stay under 3 req/s
  }
}

// TrackCourier's free plan is small (100 lookups/month), so bulk refreshes are throttled.
const TC_MIN_HOURS = 6;
const TC_MAX_PER_RUN = 15;

function hoursSince(sqliteUtc: string): number {
  return (Date.now() - new Date(sqliteUtc.replace(" ", "T") + "Z").getTime()) / 3_600_000;
}

async function syncTrackCourier(list: Shipment[], result: SyncResult, force: boolean) {
  let todo = list;
  if (!force) {
    todo = list
      .filter((s) => !s.last_synced_at || hoursSince(s.last_synced_at) >= TC_MIN_HOURS)
      .sort((a, b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? ""))
      .slice(0, TC_MAX_PER_RUN);
    result.deferred += list.length - todo.length;
  }
  for (let i = 0; i < todo.length; i++) {
    const s = todo[i];
    try {
      applyTrack(s, await trackViaTrackCourier(s.courier, s.awb));
      result.updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof QuotaExceededError) {
        result.errors.push(msg);
        result.deferred += todo.length - i; // stop; don't mark parcels as broken
        return;
      }
      markError(s, msg);
      result.failed++;
      result.errors.push(`${s.awb}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 700)); // gentle on the free rate limit
  }
}

/** Fetches live status for the given shipments using whichever route each courier has. */
export async function syncShipments(
  list: Shipment[],
  opts: { force?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { updated: 0, failed: 0, skipped: 0, deferred: 0, errors: [] };
  const sfx = list.filter((s) => s.courier === "shadowfax");
  const rest = list.filter((s) => s.courier !== "shadowfax");

  await syncShadowfax(sfx, result);

  if (rest.length) {
    if (hasTrackCourierKey()) {
      await syncTrackCourier(
        rest.filter((s) => supportsTrackCourier(s.courier)),
        result,
        opts.force ?? false,
      );
    } else if (hasApiKey()) {
      try {
        await sync17(rest, result);
      } catch (e) {
        result.failed += rest.length;
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    } else {
      result.skipped += rest.length; // no automatic route; update these by hand
    }
  }
  return result;
}

export async function syncOne(userId: number, id: number): Promise<SyncResult> {
  const s = getShipment(userId, id);
  if (!s) return { updated: 0, failed: 0, skipped: 0, deferred: 0, errors: ["Shipment not found"] };
  return syncShipments([s], { force: true });
}

export async function syncAllOpen(userId: number): Promise<SyncResult> {
  return syncShipments(openShipments(userId));
}
