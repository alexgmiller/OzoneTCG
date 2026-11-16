# OzoneTCG

Internal tool for running OzoneTCG, a trading-card business. One shared login, phone-first.
It tracks inventory (slabs, singles, sealed, consigned), prices it nightly from JustTCG and eBay,
records buys, sells and trades at shows, and keeps expenses, tax reports and partner payouts.

Stack: Next.js (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind, deployed on Vercel.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase keys, `OZONE_WORKSPACE_ID`, pricing API keys).
3. `npm run dev` and open http://localhost:3000

## Checks

- `npm test` runs the vitest suite; `npm run build` must pass before every commit.
- Database changes are SQL files in `migrations/`, applied by hand. See `migrations/README.md`.
- Nightly price crons are in `vercel.json` and authenticate with `CRON_SECRET`.
