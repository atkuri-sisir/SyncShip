import Link from "next/link";
import { connection } from "next/server";
import { listShipments, statusCounts, STATUSES } from "@/lib/db";
import { COURIERS, getCourier } from "@/lib/couriers";
import { requireUser } from "@/lib/auth";
import { daysSince, fmtDate, fmtDateTime, needsAttention } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardCharts } from "@/components/Charts";
import { Hero } from "@/components/Hero";
import { GROUPS, computeStats, groupOf, isGroupKey } from "@/lib/stats";
import { setStatusAction, syncAllAction } from "./actions";

type SP = Promise<Record<string, string | string[] | undefined>>;

function TileIcon({ name }: { name: "transit" | "pin" | "check" | "alert" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (name) {
    case "transit":
      return (<svg {...common}><path d="M3 12h14" /><path d="m12 6 6 6-6 6" /></svg>);
    case "pin":
      return (<svg {...common}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.4" /></svg>);
    case "check":
      return (<svg {...common}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
    default:
      return (<svg {...common}><path d="M12 8v5" /><path d="M12 17.2v.1" /><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>);
  }
}

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

  let rows = await listShipments(user.id, { q, courier, status });
  if (attention) rows = rows.filter(needsAttention);
  if (group) rows = rows.filter((s) => groupOf(s.status) === group);

  const counts = await statusCounts(user.id);
  const all = await listShipments(user.id, {});
  const attentionCount = all.filter(needsAttention).length;
  const stats = computeStats(all);
  const hasManualParcels = all.some(
    (s) => !getCourier(s.courier)?.auto && s.status !== "Delivered" && s.status !== "Returned",
  );

  const tiles = [
    { label: "In transit", n: counts["In Transit"] ?? 0, href: "/?status=In+Transit", color: "var(--g-transit)", icon: "transit" },
    { label: "Out for delivery", n: counts["Out for Delivery"] ?? 0, href: "/?status=Out+for+Delivery", color: "var(--g-ofd)", icon: "pin" },
    { label: "Delivered", n: counts["Delivered"] ?? 0, href: "/?status=Delivered", color: "var(--g-delivered)", icon: "check" },
    { label: "Needs attention", n: attentionCount, href: "/?attention=1", color: "var(--g-attention)", icon: "alert" },
  ] as const;

  return (
    <div className="space-y-6">
      {msg && (
        <div className="reveal rounded-2xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-sm font-medium text-teal-900 shadow-sm">{msg}</div>
      )}

      {hasManualParcels && (
        <div className="reveal panel px-4 py-3 text-sm text-slate-600">
          Shadowfax parcels update automatically. For other couriers, open a parcel, tap{" "}
          <b>Open on courier site</b>, then mark its status here (or use <b>Delivered</b> in the list).
        </div>
      )}

      <Hero
        name={user.name}
        total={all.length}
        onTheMove={(counts["In Transit"] ?? 0) + (counts["Out for Delivery"] ?? 0)}
        needAttention={attentionCount}
        delivered={counts["Delivered"] ?? 0}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            style={{ "--d": i, "--c": t.color } as React.CSSProperties}
            className="panel panel-hover pop group relative overflow-hidden p-4"
          >
            <span
              aria-hidden
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.16] transition-transform duration-500 group-hover:scale-125"
              style={{ background: t.color }}
            />
            <div className="relative flex items-center gap-2.5 text-sm font-medium text-slate-600">
              <span
                className="grid h-8 w-8 place-items-center rounded-xl text-white shadow-sm"
                style={{ background: t.color }}
              >
                <TileIcon name={t.icon} />
              </span>
              {t.label}
            </div>
            <div className="relative mt-3 font-display text-5xl font-extrabold leading-none text-slate-900">{t.n}</div>
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
            className="w-64 rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60"
          />
          <select name="courier" defaultValue={courier} className="rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60">
            <option value="">All couriers</option>
            {COURIERS.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={status} className="rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60">
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
          <button className="btn-primary px-5 py-2">Filter</button>
          {(q || courier || status || attention || group) && (
            <Link href="/" className="px-2 py-2 text-slate-500 underline">Clear</Link>
          )}
        </form>

        <form action={syncAllAction} className="flex items-center gap-3 text-sm">
          <button
            title="Updates Shadowfax parcels automatically"
            className="btn-outline px-4 py-2"
          >
            ↻ Refresh all
          </button>
        </form>
      </div>

      <div className="panel reveal overflow-x-auto" style={{ "--d": 8 } as React.CSSProperties}>
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
            {rows.map((s, idx) => (
              <tr key={s.id} className="row-in" style={{ "--i": idx, "--row-c": GROUPS.find((g) => g.key === groupOf(s.status))?.color } as React.CSSProperties}>
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
