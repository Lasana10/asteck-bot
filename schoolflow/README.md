# DREEM School Operating System

DREEM connects school leadership, learner OneFiles, teacher growth, protected finance operations, and parent/teacher signals in one bilingual-ready workspace.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Without Supabase credentials the app opens a clearly marked demo workspace. Production must set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (never a secret or service-role key)
- `VITE_DREEM_DEMO_MODE=false`

Run `npm run check` before release. It performs linting, unit tests, TypeScript checking, and the production build.

## Cloud deployment

The recommended first production setup is **Vercel for the Vite frontend + Supabase for Auth/Postgres/Storage**. In Vercel, import `Lasana10/asteck-bot`, set the root directory to `schoolflow`, use `npm run build`, publish `dist`, and add the three environment variables above.

Cloudflare Pages is an equally valid frontend alternative when edge delivery and later offline/Worker features become the priority. Use the same root, build command, output directory, and environment variables. Do not deploy a second database: Supabase remains the system of record.

## Data safety

- Public clients use only the Supabase publishable key.
- DREEM tables use row-level security and school membership/role checks.
- Payments and payment events are immutable; corrections use reversal records.
- Cashier and reviewer separation is enforced in the database.
- The shared TSIDKENU project is temporary. All DREEM-owned tables are prefixed `dreem_` for later separation.

