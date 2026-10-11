import { DatabaseSync } from "node:sqlite";
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

const globalForDb = globalThis as unknown as { __syncshipDb?: DatabaseSync };

function hasColumn(d: DatabaseSync, table: string, column: string): boolean {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  return cols.some((c) => c.name === column);
}

function open(): DatabaseSync {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const d = new DatabaseSync(path.join(dir, "syncship.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
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
  `);

  // Upgrade a pre-accounts database: rebuild shipments with user_id and per-user uniqueness.
  if (!hasColumn(d, "shipments", "user_id")) {
    d.exec(`
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
    `);
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_shipments_user ON shipments(user_id, status)");
  return d;
}

export function db(): DatabaseSync {
  if (!globalForDb.__syncshipDb) globalForDb.__syncshipDb = open();
  return globalForDb.__syncshipDb;
}

export function getKv(key: string): string | null {
  const row = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setKv(key: string, value: string) {
  db()
    .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/** Parcels saved before accounts existed belong to whoever signs up first. */
export function claimOrphanShipments(userId: number) {
  db().prepare("UPDATE shipments SET user_id = ? WHERE user_id IS NULL").run(userId);
}

export type ListFilters = {
  q?: string;
  courier?: string;
  status?: string;
};

export function listShipments(userId: number, f: ListFilters = {}): Shipment[] {
  const where: string[] = ["user_id = ?"];
  const params: (string | number)[] = [userId];
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
  const sql = `SELECT * FROM shipments WHERE ${where.join(" AND ")} ORDER BY dispatch_date DESC, id DESC LIMIT 500`;
  return db().prepare(sql).all(...params) as unknown as Shipment[];
}

export function getShipment(userId: number, id: number): Shipment | undefined {
  return db().prepare("SELECT * FROM shipments WHERE id = ? AND user_id = ?").get(id, userId) as
    | Shipment
    | undefined;
}

export function getEvents(shipmentId: number): TrackEvent[] {
  return db()
    .prepare("SELECT * FROM events WHERE shipment_id = ? ORDER BY time DESC, id DESC")
    .all(shipmentId) as unknown as TrackEvent[];
}

export function statusCounts(userId: number): Record<string, number> {
  const rows = db()
    .prepare("SELECT status, COUNT(*) AS n FROM shipments WHERE user_id = ? GROUP BY status")
    .all(userId) as unknown as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** This user's shipments that are still worth syncing (not finished). */
export function openShipments(userId: number): Shipment[] {
  return db()
    .prepare(
      "SELECT * FROM shipments WHERE user_id = ? AND status NOT IN ('Delivered','Returned') AND manual = 0 ORDER BY dispatch_date ASC",
    )
    .all(userId) as unknown as Shipment[];
}
