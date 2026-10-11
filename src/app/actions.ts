"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getShipment, run, STATUSES, type Shipment, type Status } from "@/lib/db";
import { COURIERS, getCourier } from "@/lib/couriers";
import { requireUser } from "@/lib/auth";
import { syncAllOpen, syncOne, syncShipments, type SyncResult } from "@/lib/sync";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Matches "DTDC", "Speed Post", "tpc", "India Post", "blue dart" ... to a courier key. */
function courierFromName(name: string): string {
  const n = normalize(name);
  if (!n) return "";
  const alias: Record<string, string> = { tpc: "professional", indiapost: "speedpost", flipkart: "ekart" };
  if (alias[n]) return alias[n];
  const hit = COURIERS.find((c) => c.key === n || normalize(c.name) === n || normalize(c.name).startsWith(n));
  return hit?.key ?? "";
}

/** Optional server-wide keys; normal users never see or need these. */
function hasOperatorKey(): boolean {
  return Boolean(process.env.TRACKCOURIER_KEY || process.env.TRACK17_KEY);
}

async function insertShipment(
  userId: number,
  courier: string,
  awb: string,
  label: string,
  invoice: string,
  date: string,
): Promise<{ result: "added" | "duplicate" | "invalid"; id?: number }> {
  if (!getCourier(courier) || !awb) return { result: "invalid" };
  const r = await run(
    `INSERT OR IGNORE INTO shipments (user_id, awb, courier, hospital, invoice_no, dispatch_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, awb, courier, label, invoice || null, date || today()],
  );
  return r.changes
    ? { result: "added", id: r.lastId }
    : { result: "duplicate" };
}

/** Fetch live status right after a parcel is added; never blocks adding if it fails. */
async function autoSync(userId: number, ids: number[], bulk = false) {
  const list = (await Promise.all(ids.map((id) => getShipment(userId, id)))).filter((s): s is Shipment => Boolean(s));
  // Shadowfax is free and unlimited. Any other automatic route (an operator-configured
  // key with a small quota) is only used for single adds, never for a bulk import.
  const pick = bulk ? list.filter((s) => getCourier(s.courier)?.auto) : list.filter((s) => getCourier(s.courier)?.auto || hasOperatorKey());
  try {
    await syncShipments(pick, { force: true });
  } catch {
    /* parcel is saved; user can refresh later */
  }
}

export async function addShipment(formData: FormData) {
  const user = await requireUser();
  const { result: res, id } = await insertShipment(
    user.id,
    str(formData.get("courier")),
    str(formData.get("awb")),
    str(formData.get("label")),
    str(formData.get("invoice")),
    str(formData.get("date")),
  );
  if (id) await autoSync(user.id, [id]);
  revalidatePath("/");
  const added = id ? await getShipment(user.id, id) : undefined;
  const msg =
    res === "added"
      ? added && added.status !== "Pending"
        ? `Parcel added. Status: ${added.status}`
        : "Parcel added"
      : res === "duplicate"
        ? "You already added that tracking number"
        : "Please choose a courier and enter the tracking number";
  redirect(`/?msg=${encodeURIComponent(msg)}`);
}

/** Lines: courier, tracking no., label(optional), invoice(optional), date(optional YYYY-MM-DD) */
export async function importShipments(formData: FormData) {
  const user = await requireUser();
  const text = str(formData.get("csv"));
  const counts = { added: 0, duplicate: 0, invalid: 0 };
  const newIds: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^courier\s*,/i.test(line)) continue;
    const [courierName = "", awb = "", label = "", invoice = "", date = ""] = line
      .split(",")
      .map((c) => c.trim());
    const { result, id } = await insertShipment(user.id, courierFromName(courierName), awb, label, invoice, date);
    counts[result]++;
    if (id) newIds.push(id);
  }
  await autoSync(user.id, newIds, true);
  revalidatePath("/");
  redirect(
    `/?msg=${encodeURIComponent(
      `Imported ${counts.added} (skipped ${counts.duplicate} duplicates, ${counts.invalid} unreadable lines)`,
    )}`,
  );
}

function describe(r: SyncResult): string {
  let msg = `Updated ${r.updated} parcel(s)`;
  if (r.failed) msg += `, ${r.failed} failed: ${r.errors.slice(0, 2).join("; ")}`;
  if (r.deferred) msg += `. ${r.deferred} parcel(s) held back (refreshed recently)`;
  if (r.skipped) {
    msg += `. ${r.skipped} parcel(s) are on couriers without automatic tracking: use "Open on courier site" and update them by hand`;
  }
  return msg;
}

async function runSync(fn: () => Promise<SyncResult>, back: string) {
  let msg: string;
  try {
    msg = describe(await fn());
  } catch (e) {
    msg = `Sync failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  revalidatePath("/");
  revalidatePath("/shipments/[id]", "page");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

export async function syncAllAction() {
  const user = await requireUser();
  await runSync(() => syncAllOpen(user.id), "/");
}

export async function syncOneAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData.get("id")));
  await runSync(() => syncOne(user.id, id), `/shipments/${id}`);
}

export async function setStatusAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData.get("id")));
  const status = str(formData.get("status")) as Status;
  const rawBack = str(formData.get("back"));
  // only allow returning to a page of this app
  const back = rawBack.startsWith("/") && !rawBack.startsWith("//") ? rawBack : "/";
  if (STATUSES.includes(status)) {
    // manual = 1 stops auto-sync from overwriting a hand-set status
    await run(
      `UPDATE shipments SET status = ?, manual = ?, status_detail = 'Updated manually',
         last_event_at = datetime('now') WHERE id = ? AND user_id = ?`,
      [status, status === "Delivered" || status === "Returned" ? 0 : 1, id, user.id],
    );
  }
  revalidatePath("/");
  revalidatePath("/shipments/[id]", "page");
  redirect(back);
}

export async function resumeAutoAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData.get("id")));
  await run("UPDATE shipments SET manual = 0 WHERE id = ? AND user_id = ?", [id, user.id]);
  revalidatePath("/");
  redirect(`/shipments/${id}`);
}

export async function saveNotesAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData.get("id")));
  await run("UPDATE shipments SET notes = ? WHERE id = ? AND user_id = ?", [str(formData.get("notes")) || null, id, user.id]);
  revalidatePath("/shipments/[id]", "page");
  redirect(`/shipments/${id}`);
}

export async function deleteShipmentAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData.get("id")));
  await run("DELETE FROM shipments WHERE id = ? AND user_id = ?", [id, user.id]);
  revalidatePath("/");
  redirect("/?msg=Parcel+deleted");
}
