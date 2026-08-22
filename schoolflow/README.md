# DREEM School Operating System

DREEM connects school leadership, learner OneFiles, teacher growth, protected finance operations, and parent/teacher signals in one bilingual-ready workspace.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The demo workspace is available only when it is explicitly enabled. Production must set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (never a secret or service-role key)
- `VITE_DREEM_DEMO_MODE=false`

Run `npm run check` before release. It performs linting, unit tests, TypeScript checking, and the production build.

## Cloud deployment

The production path is **Cloudflare Pages/Workers for the Vite frontend + the dedicated DREEM Supabase project for Auth/Postgres/Storage**. Import `Lasana10/asteck-bot`, select `dreem/integration`, set the root directory to `schoolflow`, run `npm ci && npm run build`, publish `dist`, and add the three environment variables above. `wrangler.jsonc` provides SPA fallback and observability for direct Worker deployment.

Do not deploy a second database: project `vlukkucwtfmfgpzvjyvd` is the authoritative DREEM system of record. Render remains a temporary compatibility lane only for worker responsibilities that have not yet moved to Cloudflare.

## Data safety

- Public clients use only the Supabase publishable key.
- DREEM tables use row-level security and school membership/role checks.
- Payments and payment events are immutable; corrections use reversal records.
- Cashier and reviewer separation is enforced in the database.
- DREEM uses its dedicated Supabase project. AFAT and TSIDKENU data and deployments remain separate.
