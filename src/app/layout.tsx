import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "./auth-actions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyncShip",
  description: "One place to track every parcel, whichever courier carries it",
  icons: { icon: "/logo.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
            {/* The PNG has empty margin; show just its artwork (x 48-260, y 40-202 of 313x248) */}
            <Link
              href="/"
              aria-label="SyncShip home"
              className="relative block overflow-hidden"
              style={{ width: 99, height: 76 }}
            >
              <Image
                src="/logo.png"
                alt="SyncShip logo"
                width={313}
                height={248}
                priority
                className="absolute max-w-none mix-blend-multiply"
                style={{ width: 146.8, height: 116.4, left: -22.5, top: -18.8, filter: "brightness(1.05)" }}
              />
            </Link>
            {user ? (
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
                  Dashboard
                </Link>
                <Link
                  href="/add"
                  className="rounded-md bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700"
                >
                  + Add parcel
                </Link>
                <span className="ml-3 hidden text-slate-500 sm:inline" title={user.email}>
                  {user.name}
                </span>
                <form action={logoutAction}>
                  <button className="rounded-md px-3 py-1.5 text-slate-500 hover:bg-slate-100">Log out</button>
                </form>
              </nav>
            ) : (
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/login" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700"
                >
                  Sign up
                </Link>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
