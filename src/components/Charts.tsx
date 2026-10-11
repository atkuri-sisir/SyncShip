import Link from "next/link";
import { GROUPS, type GroupKey, type Stats } from "@/lib/stats";

function Card({
  title,
  subtitle,
  children,
  className = "",
  d = 0,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  d?: number;
}) {
  return (
    <section className={`panel panel-hover reveal p-5 ${className}`} style={{ "--d": d } as React.CSSProperties}>
      <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

/* ---------- Donut: where every parcel is right now ---------- */

const R = 70;
const STROKE = 26;
const C = 2 * Math.PI * R;
const GAP = 3; // surface gap between slices, in px along the circumference

function DonutChart({ stats }: { stats: Stats }) {
  const present = GROUPS.map((g) => ({ ...g, n: stats.byGroup[g.key] })).filter((g) => g.n > 0);
  const slices = present.map((s, i) => ({
    ...s,
    offset: present.slice(0, i).reduce((sum, p) => sum + (p.n / stats.total) * C, 0),
  }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0 -rotate-90" role="img" aria-label="Parcels by status">
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--chart-grid)" strokeWidth={STROKE} />
        {slices.map((s, si) => {
          const len = (s.n / stats.total) * C;
          const dash = slices.length === 1 ? len : Math.max(len - GAP, 0.5);
          return (
            <Link key={s.key} href={`/?group=${s.key}`}>
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-s.offset}
                className="sweep cursor-pointer transition-opacity hover:opacity-80"
                style={{ "--i": si } as React.CSSProperties}
              >
                <title>{`${s.label}: ${s.n} (${pct(s.n, stats.total)})`}</title>
              </circle>
            </Link>
          );
        })}
        <g className="rotate-90 origin-center" style={{ transformOrigin: "100px 100px" }}>
          <text x="100" y="104" textAnchor="middle" className="fill-slate-900" fontSize="34" fontWeight="600">
            {stats.total}
          </text>
          <text x="100" y="124" textAnchor="middle" fill="var(--chart-muted)" fontSize="12">
            {stats.total === 1 ? "parcel" : "parcels"}
          </text>
        </g>
      </svg>

      <ul className="w-full space-y-1.5 text-sm">
        {GROUPS.map((g) => (
          <li key={g.key}>
            <Link
              href={`/?group=${g.key}`}
              className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-slate-50"
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: g.color }} />
              <span className="flex-1 text-slate-700">{g.label}</span>
              <span className="font-semibold text-slate-900">{stats.byGroup[g.key]}</span>
              <span className="w-10 text-right text-slate-400">{pct(stats.byGroup[g.key], stats.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Stacked bars: each courier's parcels by state ---------- */

function CourierBars({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.byCourier.map((c) => c.total));
  return (
    <div className="space-y-3">
      {stats.byCourier.map((c, ci) => {
        const parts = GROUPS.filter((g) => c.groups[g.key] > 0);
        return (
          <div key={c.key} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-sm text-slate-700">{c.name}</div>
            <div className="flex h-6 flex-1 items-center gap-2">
              <div className="grow-x flex h-6 gap-[2px]" style={{ width: `${(c.total / max) * 88}%`, "--i": ci } as React.CSSProperties}>
                {parts.map((g, i) => (
                  <Link
                    key={g.key}
                    href={`/?courier=${c.key}&group=${g.key}`}
                    title={`${c.name} · ${g.label}: ${c.groups[g.key]}`}
                    className={`h-full transition-opacity hover:opacity-80 ${
                      i === parts.length - 1 ? "rounded-r" : ""
                    }`}
                    style={{ background: g.color, flex: c.groups[g.key] }}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-slate-900">{c.total}</span>
            </div>
          </div>
        );
      })}
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-slate-600">
      {GROUPS.map((g) => (
        <li key={g.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
          {g.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Columns: parcels dispatched per day ---------- */

function DispatchColumns({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.perDay.map((d) => d.count));
  const maxIdx = stats.perDay.findIndex((d) => d.count === max && max > 0);
  const last = stats.perDay.length - 1;
  const H = 130;
  return (
    <div>
      <div className="relative flex items-end gap-1.5 border-b border-[var(--chart-grid)]" style={{ height: H }}>
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-[var(--chart-grid)]"
          style={{ bottom: H - 1 }}
        >
          <span className="absolute -top-2 left-0 bg-white pr-1 text-[10px] text-[var(--chart-muted)]">{max}</span>
        </div>
        {stats.perDay.map((d, i) => {
          const h = d.count ? Math.max((d.count / max) * (H - 18), 3) : 0;
          const show = d.count > 0 && (i === maxIdx || i === last);
          return (
            <div
              key={d.date}
              className="group flex h-full flex-1 flex-col items-center justify-end"
              title={`${d.label}: ${d.count} parcel${d.count === 1 ? "" : "s"}`}
            >
              {show && <span className="mb-0.5 text-xs font-semibold text-slate-700">{d.count}</span>}
              <div
                className="grow-y w-full max-w-6 rounded-t bg-[linear-gradient(180deg,#38bdf8,var(--g-transit))] transition-opacity group-hover:opacity-75"
                style={{ height: h, "--i": i } as React.CSSProperties}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[10px] text-[var(--chart-muted)]">
        {stats.perDay.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % 2 === (stats.perDay.length - 1) % 2 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Bars: how long open parcels have been waiting ---------- */

const AGING_COLORS = ["#86b6ef", "#3987e5", "#1c5cab", "#104281"]; // one-hue ramp, lighter = newer

function AgingBars({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.aging.map((a) => a.count));
  return (
    <div className="space-y-2.5">
      {stats.aging.map((a, i) => (
        <div key={a.label} className="flex items-center gap-3" title={`${a.label}: ${a.count} open parcel(s)`}>
          <div className="w-16 shrink-0 text-sm text-slate-600">{a.label}</div>
          <div className="flex flex-1 items-center gap-2">
            <div
              className="grow-x h-5 rounded-r"
              style={{ width: `${(a.count / max) * 85}%`, minWidth: a.count ? 4 : 0, background: AGING_COLORS[i], "--i": i } as React.CSSProperties}
            />
            <span className="text-sm font-semibold text-slate-900">{a.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Table view of the same numbers ---------- */

function TableView({ stats }: { stats: Stats }) {
  return (
    <details className="panel px-5 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">View chart numbers as a table</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1.5 pr-4">Courier</th>
              {GROUPS.map((g) => (
                <th key={g.key} className="px-2 py-1.5 text-right">{g.label}</th>
              ))}
              <th className="px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.byCourier.map((c) => (
              <tr key={c.key}>
                <td className="py-1.5 pr-4">{c.name}</td>
                {GROUPS.map((g) => (
                  <td key={g.key} className="px-2 py-1.5 text-right">{c.groups[g.key as GroupKey]}</td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold">{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function DashboardCharts({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Where your parcels are" subtitle="Click a slice to filter the list" className="lg:col-span-2" d={4}>
          <DonutChart stats={stats} />
        </Card>
        <Card title="Parcels by courier" subtitle="Split by current state" className="lg:col-span-3" d={5}>
          <CourierBars stats={stats} />
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Dispatched per day" subtitle="Last 14 days" className="lg:col-span-3" d={6}>
          <DispatchColumns stats={stats} />
        </Card>
        <Card
          title="How long open parcels have waited"
          subtitle={`${stats.openCount} parcel${stats.openCount === 1 ? "" : "s"} not yet delivered`}
          className="lg:col-span-2"
          d={7}
        >
          <AgingBars stats={stats} />
        </Card>
      </div>
      <TableView stats={stats} />
    </div>
  );
}
