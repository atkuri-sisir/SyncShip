# SyncShip

One place to follow every parcel, whichever courier carries it. Built for people who receive parcels
(Shadowfax, Delhivery, DTDC, Speed Post, Professional Courier, Blue Dart, XpressBees, Ekart, Trackon, others),
and works just as well for a small business sending parcels.

## Run it
```
npm install
npm run dev        # http://localhost:3000
```
Needs Node 22.5+ (uses the built-in `node:sqlite`). Data lives in `data/syncship.db`; back that file up.

## For users: nothing to set up
- Sign up with any email and a password. No API keys, no business email.
- Add a parcel (courier + tracking number). Paste many at once if you like.
- **Shadowfax** parcels update automatically.
- **Other couriers**: tap **Open on courier site** on a parcel, read the status there, then tap **Delivered**
  (or pick another status). The dashboard still shows charts, what is overdue, and what needs a look.
- Each account only ever sees its own parcels.

## Why only Shadowfax is automatic
The other couriers' tracking pages sit behind bot checks, origin checks, or phone-OTP, and their real APIs
need a business account. SyncShip does not try to get around those. Shadowfax's public tracker serves its status
without any of that, via `src/lib/shadowfax.ts` (unofficial, so it can stop working if Shadowfax changes it;
a failure shows as "Sync issue" and the parcel can be updated by hand).

## Optional, for whoever runs the server (users never see this)
If you, the operator, have a key, set it in `.env.local` (see `.env.local.example`):
`TRACKCOURIER_KEY` (https://api.trackcourier.io, free plan 100 lookups/month for everyone on this server)
or `TRACK17_KEY`. Then other couriers update too, rate-limited to protect the small free quota.

## Before putting it on the internet
- Run it behind HTTPS (the session cookie is `Secure` in production).
- It needs a host with a **persistent disk** (SQLite file). Serverless hosts such as Vercel lose the file on
  every deploy; for those, the database layer in `src/lib/db.ts` has to move to a hosted database (e.g. Turso).
- Accounts are email + password only: no email verification and no "forgot password" yet.
- All users share one server, so one IP calls Shadowfax for everyone.

## Code map
- `src/lib/auth.ts`, `src/app/auth-actions.ts` accounts and sessions
- `src/lib/db.ts` SQLite storage (every query is scoped to the signed-in user)
- `src/lib/couriers.ts` courier list and tracking-page links
- `src/lib/shadowfax.ts` the automatic Shadowfax adapter; `src/lib/sync.ts` routes refreshes
- `src/lib/trackcourier.ts`, `src/lib/track17.ts` optional operator-key adapters (off by default)
- `src/components/Charts.tsx`, `src/lib/stats.ts` dashboard charts
