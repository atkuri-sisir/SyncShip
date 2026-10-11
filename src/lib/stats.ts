import type { Shipment, Status } from "./db";
import { COURIERS } from "./couriers";
import { daysSince } from "./format";

export type GroupKey = "delivered" | "transit" | "ofd" | "awaiting" | "attention";

/** Order here is the stack/legend order; colors are validated in light mode (see globals.css). */
export const GROUPS: { key: GroupKey; label: string; color: string; statuses: Status[] }[] = [
  { key: "delivered", label: "Delivered", color: "var(--g-delivered)", statuses: ["Delivered"] },
  { key: "transit", label: "In transit", color: "var(--g-transit)", statuses: ["In Transit"] },
  { key: "ofd", label: "Out for delivery", color: "var(--g-ofd)", statuses: ["Out for Delivery"] },
  { key: "awaiting", label: "Awaiting pickup", color: "var(--g-awaiting)", statuses: ["Pending", "Created"] },
  { key: "attention", label: "Exception or returned", color: "var(--g-attention)", statuses: ["Exception", "Returned"] },
];

export function groupOf(status: Status): GroupKey {
  return GROUPS.find((g) => g.statuses.includes(status))?.key ?? "awaiting";
}

export function isGroupKey(v: string): v is GroupKey {
  return GROUPS.some((g) => g.key === v);
}

export type Stats = {
  total: number;
  byGroup: Record<GroupKey, number>;
  byCourier: { key: string; name: string; total: number; groups: Record<GroupKey, number> }[];
  perDay: { date: string; label: string; count: number }[];
  aging: { label: string; count: number }[];
  openCount: number;
};

const emptyGroups = (): Record<GroupKey, number> => ({
  delivered: 0,
  transit: 0,
  ofd: 0,
  awaiting: 0,
  attention: 0,
});

export function computeStats(all: Shipment[], days = 14): Stats {
  const byGroup = emptyGroups();
  const courierMap = new Map(
    COURIERS.map((c) => [c.key, { key: c.key, name: c.name, total: 0, groups: emptyGroups() }]),
  );
  const perDayMap = new Map<string, number>();
  const aging = [
    { label: "0–1 days", count: 0 },
    { label: "2–4 days", count: 0 },
    { label: "5–7 days", count: 0 },
    { label: "8+ days", count: 0 },
  ];
  let openCount = 0;

  for (const s of all) {
    const g = groupOf(s.status);
    byGroup[g]++;
    const c = courierMap.get(s.courier);
    if (c) {
      c.total++;
      c.groups[g]++;
    }
    perDayMap.set(s.dispatch_date, (perDayMap.get(s.dispatch_date) ?? 0) + 1);
    if (s.status !== "Delivered" && s.status !== "Returned") {
      openCount++;
      const d = daysSince(s.dispatch_date);
      aging[d <= 1 ? 0 : d <= 4 ? 1 : d <= 7 ? 2 : 3].count++;
    }
  }

  const perDay: Stats["perDay"] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    perDay.push({
      date: iso,
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      count: perDayMap.get(iso) ?? 0,
    });
  }

  return {
    total: all.length,
    byGroup,
    byCourier: [...courierMap.values()].filter((c) => c.total > 0),
    perDay,
    aging,
    openCount,
  };
}
