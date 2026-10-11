"use server";

import { redirect } from "next/navigation";
import { claimOrphanShipments, get, run, type User } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

const back = (path: string, error: string): never =>
  redirect(`${path}?error=${encodeURIComponent(error)}`);

export async function signupAction(formData: FormData) {
  const name = str(formData.get("name"));
  const email = str(formData.get("email")).toLowerCase();
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  if (!name) back("/signup", "Please enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/signup", "Please enter a valid email address");
  if (password.length < 8) back("/signup", "Password must be at least 8 characters");

  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) back("/signup", "An account with this email already exists. Try logging in.");

  const r = await run("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)", [
    email,
    name,
    hashPassword(password),
  ]);
  const userId = Number(r.lastId);

  // The very first account inherits any parcels saved before accounts existed.
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0;
  if (count === 1) await claimOrphanShipments(userId);

  await createSession(userId);
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const email = str(formData.get("email")).toLowerCase();
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  const user = await get<User>("SELECT * FROM users WHERE email = ?", [email]);
  // Same message and a short delay either way, so guessing is slow and reveals nothing.
  const ok = user ? verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) {
    await new Promise((r) => setTimeout(r, 800));
    back("/login", "Wrong email or password");
  }
  await createSession(user!.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
