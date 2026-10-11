import Link from "next/link";
import { connection } from "next/server";
import { listShipments, statusCounts, STATUSES } from "@/lib/db";
import { COURIERS, getCourier } from "@/lib/couriers";
import { requireUser } from "@/lib/auth";
import { daysSince, fmtDate, fmtDateTime, needsAttention } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardCharts } from "@/components/Charts";
import { GROUPS, computeStats, groupOf, isGroupKey } from "@/lib/stats";
import { setStatusAction, syncAllAction } from "./actions";

type SP = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const q = one(sp.q);
  const courier = one(sp.courier);
  const status = one(sp.status);
  const attention = one(sp.attention) === "1";
  const groupParam = one(sp.group);
  const group = isGroupKey(groupParam) ? groupParam : "";
  const msg = one(sp.msg);

  let rows = listShipments(user.id, { q, courier, status });
  if (attention) rows = rows.filter(needsAttention);
  if (group) rows = rows.filter((s) => groupOf(s.status) === group);

  const counts = statusCounts(user.id);
  const all = listShipments(user.id, {});
  const attentionCount = all.filter(needsAttention).length;
  const stats = computeStats(all);
  const hasManualParcels = all.some(
    (s) => !getCourier(s.courier)?.auto && s.status !== "Delivered" && s.status !== "Returned",
  );

  const tiles = [
    { label: "In transit", n: counts["In Transit"] ?? 0, href: "/?status=In+Transit", color: "var(--g-transit)" },
    { label: "Out for delivery", n: counts["Out for Delivery"] ?? 0, href: "/?status=Out+for+Delivery", color: "var(--g-ofd)" },
    { label: "Delivered", n: counts["Delivered"] ?? 0, href: "/?status=Delivered", color: "var(--g-delivered)" },
    { label: "Needs attention", n: attentionCount, href: "/?attention=1", color: "var(--g-attention)" },
  ];

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">{msg}</div>
      )}

      {hasManualParcels && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">
          Shadowfax parcels update automatically. For other couriers, open a parcel, tap{" "}
          <b>Open on courier site</b>, then mark its status here (or use <b>Delivered</b> in the list).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300"
          >
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{t.n}</div>
          </Link>
        ))}
      </div>

      <DashboardCharts stats={stats} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2 text-sm" action="/">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search tracking no., hospital, invoice"
            className="w-64 rounded-md border border-slate-300 bg-white px-3 py-2"
          />
          <select name="courier" defaultValue={courier} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">All couriers</option>
            {COURIERS.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={status} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {group && <input type="hidden" name="group" value={group} />}
          {group && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
              Showing: {GROUPS.find((g) => g.key === group)?.label}
            </span>
          )}
          <button className="rounded-md bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-900">Filter</button>
          {(q || courier || status || attention || group) && (
            <Link href="/" className="px-2 py-2 text-slate-500 underline">Clear</Link>
          )}
        </form>

        <form action={syncAllAction} className="flex items-center gap-3 text-sm">
          <button
            title="Updates Shadowfax parcels automatically"
            className="rounded-md border border-teal-600 px-4 py-2 font-medium text-teal-700 hover:bg-teal-50"
          >
            ↻ Refresh all
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Tracking no.</th>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Item / note</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Latest update</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {all.length === 0 ? (
                    <>
                      No parcels yet. <Link href="/add" className="text-teal-700 underline">Add your first parcel</Link>{" "}
                      with its courier and tracking number.
                    </>
                  ) : (
                    "No parcels match these filters."
                  )}
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono">
                  <Link href={`/shipments/${s.id}`} className="text-teal-700 hover:underline">{s.awb}</Link>
                  {s.invoice_no && <div className="font-sans text-xs text-slate-500">Inv {s.invoice_no}</div>}
                </td>
                <td className="px-4 py-3">{getCourier(s.courier)?.name ?? s.courier}</td>
                <td className="px-4 py-3">{s.hospital || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {fmtDate(s.dispatch_date)}
                  {needsAttention(s) && s.status !== "Exception" && (
                    <div className="text-xs text-red-600">{daysSince(s.dispatch_date)} days, still open</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                  {s.last_sync_error && <div className="mt-1 max-w-48 truncate text-xs text-red-600" title={s.last_sync_error}>Sync issue</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="max-w-xs truncate" title={s.status_detail ?? ""}>{s.status_detail ?? "No updates yet"}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(s.last_event_at)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status !== "Delivered" && s.status !== "Returned" && (
                    <form action={setStatusAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="Delivered" />
                      <input type="hidden" name="back" value="/" />
                      <button className="whitespace-nowrap rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                        ✓ Delivered
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
