import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { signupAction } from "../auth-actions";

const input = "w-full rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-200/60 text-sm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <>
      <div className="blob b1" aria-hidden />
      <div className="blob b2" aria-hidden />
      <div className="blob b3" aria-hidden />
      <div className="pop mx-auto mt-6 max-w-sm panel p-7">
      <h1 className="text-3xl font-extrabold">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">
        Free. Any email works, and there is nothing to set up. Your parcels stay private to you.
      </p>
      {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <form action={signupAction} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Your name</span>
          <input name="name" required autoComplete="name" className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Email</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Password (8+ characters)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </label>
        <button className="w-full btn-primary px-4 py-2 text-sm">
          Create account
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-teal-700 underline">Log in</Link>
      </p>
    </div>
    </>
  );
}
