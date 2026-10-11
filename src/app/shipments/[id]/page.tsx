import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEvents, getShipment, STATUSES } from "@/lib/db";
import { getCourier, officialTrackUrl, quickCheckUrl } from "@/lib/couriers";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import {
  deleteShipmentAction,
  resumeAutoAction,
  saveNotesAction,
  setStatusAction,
  syncOneAction,
} from "../../actions";

export default async function ShipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await requireUser();
  const { id: idStr } = await params;
  const sp = await searchParams;
  const msg = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const id = Number(idStr);
  const s = Number.isInteger(id) ? getShipment(user.id, id) : undefined;
  if (!s) notFound();

  const events = getEvents(s.id);
  const courier = getCourier(s.courier);
  const official = officialTrackUrl(s.courier, s.awb);
  const quick = quickCheckUrl(s.courier, s.awb);

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-slate-500 hover:underline">← All parcels</Link>

      {msg && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">{msg}</div>
      )}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-2xl font-semibold">{s.awb}</div>
            <div className="mt-1 text-slate-600">
              {courier?.name ?? s.courier}
              {s.hospital && <> · {s.hospital}</>}
              {s.invoice_no && <> · Ref {s.invoice_no}</>}
            </div>
            <div className="mt-1 text-sm text-slate-400">Added {fmtDate(s.dispatch_date)}</div>
          </div>
          <div className="text-right">
            <StatusBadge status={s.status} />
            <div className="mt-2 text-sm text-slate-500">{s.status_detail ?? "No updates yet"}</div>
            <div className="text-xs text-slate-400">Last synced {fmtDateTime(s.last_synced_at)}</div>
          </div>
        </div>
        {s.last_sync_error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Last sync problem: {s.last_sync_error}. Check the tracking number and courier.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <form action={syncOneAction}>
            <input type="hidden" name="id" value={s.id} />
            <button className="btn-outline px-3 py-1.5">
              ↻ Refresh status
            </button>
          </form>
          {official && (
            <a
              href={official}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-300 bg-white/70 px-3 py-1.5 text-slate-700 transition hover:-translate-y-px hover:bg-white"
            >
              Open on {courier?.name} site ↗
            </a>
          )}
          {quick && (
            <a
              href={quick}
              target="_blank"
              rel="noreferrer"
              title="Third-party page with your number pre-filled. It shows ads and may have no data for some parcels."
              className="rounded-xl border border-slate-300 bg-white/70 px-3 py-1.5 text-slate-700 transition hover:-translate-y-px hover:bg-white"
            >
              Quick check (TrackCourier.io) ↗
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <section className="panel p-5 md:col-span-2">
          <h2 className="mb-3 font-semibold">Tracking history</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">
              No courier events yet. They appear after the first refresh, or once the courier scans the parcel.
            </p>
          ) : (
            <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-500" />
                  <div className="text-sm">{e.description}</div>
                  <div className="text-xs text-slate-400">
                    {fmtDateTime(e.time)}
                    {e.location && <> · {e.location}</>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="mb-3 font-semibold">Set status by hand</h2>
            <form action={setStatusAction} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="back" value={`/shipments/${s.id}`} />
              <select name="status" defaultValue={s.status} className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60">
                {STATUSES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <button className="w-full btn-primary px-3 py-2">
                Update
              </button>
            </form>
            {s.manual === 1 && (
              <form action={resumeAutoAction} className="mt-2">
                <input type="hidden" name="id" value={s.id} />
                <p className="mb-1 text-xs text-slate-500">Auto-refresh is paused for this parcel.</p>
                <button className="text-xs text-teal-700 underline">Resume auto-tracking</button>
              </form>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="mb-3 font-semibold">Notes</h2>
            <form action={saveNotesAction} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={s.id} />
              <textarea
                name="notes"
                rows={3}
                defaultValue={s.notes ?? ""}
                className="w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60"
              />
              <button className="rounded-xl border border-slate-300 bg-white/70 px-3 py-1.5 transition hover:-translate-y-px hover:bg-white">Save notes</button>
            </form>
          </section>

          <form action={deleteShipmentAction}>
            <input type="hidden" name="id" value={s.id} />
            <button className="text-xs text-red-600 underline">Delete this shipment</button>
          </form>
        </div>
      </div>
    </div>
  );
}
