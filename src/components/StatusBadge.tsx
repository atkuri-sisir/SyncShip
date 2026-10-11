import type { Status } from "@/lib/db";

const STYLES: Record<Status, string> = {
  Pending: "bg-slate-100 text-slate-700 ring-slate-200",
  Created: "bg-sky-100 text-sky-800 ring-sky-200",
  "In Transit": "bg-blue-100 text-blue-800 ring-blue-200",
  "Out for Delivery": "bg-amber-100 text-amber-800 ring-amber-200",
  Delivered: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Exception: "bg-red-100 text-red-800 ring-red-200",
  Returned: "bg-violet-100 text-violet-800 ring-violet-200",
};

/** Statuses that deserve a live, pulsing dot so they catch the eye. */
const LIVE: Status[] = ["Out for Delivery", "Exception", "In Transit"];

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        STYLES[status] ?? STYLES.Pending
      }`}
    >
      <span className={`badge-dot ${LIVE.includes(status) ? "badge-pulse" : ""}`} />
      {status}
    </span>
  );
}
