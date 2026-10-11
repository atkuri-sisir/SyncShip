import { connection } from "next/server";
import { COURIERS } from "@/lib/couriers";
import { requireUser } from "@/lib/auth";
import { addShipment, importShipments } from "../actions";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export default async function AddPage() {
  await connection();
  await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add a parcel</h2>
        <form action={addShipment} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Courier</span>
            <select name="courier" required className={input}>
              {COURIERS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                  {c.auto ? " (updates automatically)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Tracking number (AWB)</span>
            <input name="awb" required className={`${input} font-mono`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">What is it? (optional)</span>
            <input name="label" placeholder="e.g. Phone cover from Meesho" className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Order / invoice no. (optional)</span>
              <input name="invoice" className={input} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Date</span>
              <input name="date" type="date" defaultValue={today} className={input} />
            </label>
          </div>
          <button className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            Save parcel
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Find the tracking number in the courier&apos;s SMS or the shop&apos;s order page.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Add many at once</h2>
        <p className="mb-3 text-sm text-slate-500">
          Paste one parcel per line, or copy rows from Excel:
          <br />
          <code className="text-xs">courier, tracking no., what is it, order no., date</code>
        </p>
        <form action={importShipments} className="space-y-3">
          <textarea
            name="csv"
            rows={9}
            required
            placeholder={"Delhivery, 31959715305366, Phone cover\nSpeed Post, EE123456789IN, Birthday gift, ORD-55, 2026-10-09"}
            className={`${input} font-mono`}
          />
          <button className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
            Import
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          Only the first two columns are needed. Courier names: {COURIERS.map((c) => c.name).join(", ")}.
        </p>
      </section>
    </div>
  );
}
