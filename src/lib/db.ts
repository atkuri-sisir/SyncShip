import { createClient, type Client, type InValue } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

export type Status =
  | "Pending"
  | "Created"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered"
  | "Exception"
  | "Returned";

export const STATUSES: Status[] = [
  "Pending",
  "Created",
  "In Transit",
  "Out for Delivery",
  "Delivered",
  "Exception",
  "Returned",
];

export type Shipment = {
  id: number;
  user_id: number;
  awb: string;
  courier: string;
  /** What the parcel is / who it is for. Free text, optional. */
  hospital: string;
  invoice_no: string | null;
  dispatch_date: string;
  status: Status;
  status_detail: string | null;
  last_event_at: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  manual: number;
  notes: string | null;
  created_at: string;
};

export type TrackEvent = {
  id: number;
  shipment_id: number;
  time: string | null;
  description: string;
  location: string | null;
};

export type User = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

/*
 * Storage: libSQL (SQLite compatible).
 *  - Hosted (Vercel etc.): set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
 *  - Local development: with no variables set, a file at data/syncship.db is used.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    awb TEXT NOT NULL,
    courier TEXT NOT NULL,
    hospital TEXT NOT NULL DEFAULT '',
    invoice_no TEXT,
    dispatch_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    status_detail TEXT,
    last_event_at TEXT,
    last_synced_at TEXT,
    last_sync_error TEXT,
    manual INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, courier, awb)
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    time TEXT,
    description TEXT NOT NULL,
    location TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_shipment ON events(shipment_id);
`;

/** Pre-accounts databases: rebuild shipments with user_id and per-user uniqueness. */
const LEGACY_MIGRATION = `
  PRAGMA foreign_keys = OFF;
  BEGIN;
  ALTER TABLE shipments RENAME TO shipments_old;
  CREATE TABLE shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    awb TEXT NOT NULL,
    courier TEXT NOT NULL,
    hospital TEXT NOT NULL DEFAULT '',
    invoice_no TEXT,
    dispatch_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    status_detail TEXT,
    last_event_at TEXT,
    last_synced_at TEXT,
    last_sync_error TEXT,
    manual INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, courier, awb)
  );
  INSERT INTO shipments (id, awb, courier, hospital, invoice_no, dispatch_date, status, status_detail,
    last_event_at, last_synced_at, last_sync_error, manual, notes, created_at)
    SELECT id, awb, courier, hospital, invoice_no, dispatch_date, status, status_detail,
    last_event_at, last_synced_at, last_sync_error, manual, notes, created_at FROM shipments_old;
  DROP TABLE shipments_old;
  COMMIT;
  PRAGMA foreign_keys = ON;
`;

type Handle = { client: Client; ready: Promise<void> };
const globalForDb = globalThis as unknown as { __syncshipDb?: Handle };

function connect(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  if (process.env.VERCEL) {
    throw new Error(
      "The database is not set up. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project settings, then redeploy.",
    );
  }
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  return createClient({ url: "file:data/syncship.db" });
}

async function init(client: Client) {
  await client.executeMultiple(SCHEMA);
  const info = await client.execute("PRAGMA table_info(shipments)");
  const hasUserId = info.rows.some((r) => (r as unknown as { name: string }).name === "user_id");
  if (!hasUserId) await client.executeMultiple(LEGACY_MIGRATION);
  await client.execute("CREATE INDEX IF NOT EXISTS idx_shipments_user ON shipments(user_id, status)");
}

async function handle(): Promise<Client> {
  if (!globalForDb.__syncshipDb) {
    const client = connect();
    const ready = init(client);
    ready.catch(() => {
      globalForDb.__syncshipDb = undefined; // let the next request try again
    });
    globalForDb.__syncshipDb = { client, ready };
  }
  const h = globalForDb.__syncshipDb;
  await h.ready;
  return h.client;
}

export type Arg = InValue;

export async function run(sql: string, args: Arg[] = []): Promise<{ changes: number; lastId?: number }> {
  const r = await (await handle()).execute({ sql, args });
  return { changes: r.rowsAffected, lastId: r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) };
}

export async function all<T>(sql: string, args: Arg[] = []): Promise<T[]> {
  const r = await (await handle()).execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function get<T>(sql: string, args: Arg[] = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** Several writes applied together, all or nothing. */
export async function batch(statements: { sql: string; args?: Arg[] }[]): Promise<void> {
  if (statements.length === 0) return;
  await (await handle()).batch(
    statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

export async function getKv(key: string): Promise<string | null> {
  const row = await get<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setKv(key: string, value: string) {
  await run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    key,
    value,
  ]);
}

/** Parcels saved before accounts existed belong to whoever signs up first. */
export async function claimOrphanShipments(userId: number) {
  await run("UPDATE shipments SET user_id = ? WHERE user_id IS NULL", [userId]);
}

export type ListFilters = {
  q?: string;
  courier?: string;
  status?: string;
};

export async function listShipments(userId: number, f: ListFilters = {}): Promise<Shipment[]> {
  const where: string[] = ["user_id = ?"];
  const params: Arg[] = [userId];
  if (f.q) {
    where.push("(awb LIKE ? OR hospital LIKE ? OR invoice_no LIKE ? OR notes LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }
  if (f.courier) {
    where.push("courier = ?");
    params.push(f.courier);
  }
  if (f.status) {
    where.push("status = ?");
    params.push(f.status);
  }
  return all<Shipment>(
    `SELECT * FROM shipments WHERE ${where.join(" AND ")} ORDER BY dispatch_date DESC, id DESC LIMIT 500`,
    params,
  );
}

export async function getShipment(userId: number, id: number): Promise<Shipment | undefined> {
  return get<Shipment>("SELECT * FROM shipments WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function getEvents(shipmentId: number): Promise<TrackEvent[]> {
  return all<TrackEvent>("SELECT * FROM events WHERE shipment_id = ? ORDER BY time DESC, id DESC", [shipmentId]);
}

export async function statusCounts(userId: number): Promise<Record<string, number>> {
  const rows = await all<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM shipments WHERE user_id = ? GROUP BY status",
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

/** This user's shipments that are still worth syncing (not finished). */
export async function openShipments(userId: number): Promise<Shipment[]> {
  return all<Shipment>(
    "SELECT * FROM shipments WHERE user_id = ? AND status NOT IN ('Delivered','Returned') AND manual = 0 ORDER BY dispatch_date ASC",
    [userId],
  );
}
