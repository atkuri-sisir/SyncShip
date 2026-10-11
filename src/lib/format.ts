import type { Shipment } from "./db";

const OVERDUE_DAYS = 5;

export function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  // SQLite datetime('now') has no zone and is UTC
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

/** A parcel still open after OVERDUE_DAYS, or reported as exception, needs a look. */
export function needsAttention(s: Shipment): boolean {
  if (s.status === "Delivered" || s.status === "Returned") return false;
  return s.status === "Exception" || daysSince(s.dispatch_date) >= OVERDUE_DAYS;
}
