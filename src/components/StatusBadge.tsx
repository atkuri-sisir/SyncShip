import type { Status } from "@/lib/db";

const STYLES: Record<Status, string> = {
  Pending: "bg-slate-100 text-slate-700",
  Created: "bg-sky-100 text-sky-800",
  "In Transit": "bg-blue-100 text-blue-800",
  "Out for Delivery": "bg-amber-100 text-amber-800",
  Delivered: "bg-emerald-100 text-emerald-800",
  Exception: "bg-red-100 text-red-800",
  Returned: "bg-purple-100 text-purple-800",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.Pending}`}
    >
      {status}
    </span>
  );
}
