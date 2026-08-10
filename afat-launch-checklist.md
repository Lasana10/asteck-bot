# AFAT Launch Checklist

## Goal

Launch the updated AFAT stack safely with:

- frontend on Cloudflare Pages
- backend on Render
- Supabase as database/auth/realtime
- new booking, seat-hold, ticket, onboarding, and wallet ledger flows enabled

## 1. Database First

Run these SQL files in Supabase SQL Editor in this order:

1. `db/seat_holds_and_companies.sql`
2. `db/wallet_ledger.sql`

Do this before testing the new flows.

### Tables introduced

- `seat_holds`
- `companies`
- `company_memberships`
- `wallet_ledger`

## 2. Backend Env Vars

In Render, confirm these env vars exist:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `WEBHOOK_DOMAIN`
- `SESSION_SECRET`
- `PAYMENT_API_KEY`
- `PAYMENT_PROVIDER`
- `REDIS_URL`

New important additions to set:

- `FRONTEND_URL=https://asteck-bot.pages.dev`
- `TICKET_SIGNING_SECRET=<strong-random-secret>`

Recommended:

- `NODE_ENV=production`
- `PORT=3000`
- `PAYMENT_PROVIDER=pawapay`

## 3. Frontend Env Vars

In Cloudflare Pages, set these for every environment you will test. Production variables do not always apply to branch preview URLs such as `https://<hash>.asteck-bot.pages.dev`.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=https://asteck-bot.onrender.com`

Optional if still used elsewhere:

- `VITE_GROQ_API_KEY`
- `VITE_GEMINI_API_KEY`

For preview deployments, confirm the same `VITE_*` variables exist under the Preview/Branch environment, then redeploy that preview. If the login card says `Email auth: Needs env`, expand `Env details` on the page to see which compile-time variable is missing without exposing secrets.

## 4. Local Backend Test

From project root:

```powershell
cd C:\Users\MEDION\Documents\Codex\2026-05-12\can-you-have-access-to-the\afat-src
npm run dev
```

Expected:

- backend starts on port `3000`
- `/health` returns success
- onboarding routes load
- ticket routes load

Smoke-test endpoints:

- `GET /health`
- `POST /api/onboard/passenger/register`
- `POST /api/booking/seat-hold`
- `POST /api/booking/create-from-hold`
- `POST /api/ticket/issue`
- `POST /api/ticket/verify-boarding`
- `POST /api/wallet/withdraw`

## 5. Local Frontend Test

From dashboard directory:

```powershell
cd C:\Users\MEDION\Documents\Codex\2026-05-12\can-you-have-access-to-the\afat-src\dashboard
npm run dev
```

Verify these flows:

1. guest opens app
2. commuter registration hub works
3. operator registration hub works
4. company registration hub works
5. commuter selects departure and seat
6. seat hold is created
7. booking is created from hold
8. payment screen appears with real booking id
9. ticket screen loads QR
10. guardian share button generates watch link
11. operator QR scanner accepts signed ticket

## 6. Render Deploy

The current backend is already structured for Render.

Use:

- root: repository root
- service: `sentinel-backend`
- health check: `/health`

If deploying manually:

1. push code to repo
2. trigger Render deploy
3. verify build succeeds
4. verify `/health`
5. verify `/api/ticket/issue`
6. verify `/api/guardian/token`

## 7. Cloudflare Pages Deploy

Recommended build config:

- project root: `dashboard`
- build command: `npm install && npm run build`
- output directory: `dist`

If SPA routing is needed, add Cloudflare fallback routing equivalent to the existing rewrite behavior.

## 8. Production Verification

After both deploys are live, test this exact order:

1. register commuter
2. register operator
3. register company
4. create seat hold
5. create booking from hold
6. run payment checkout
7. mark booking paid through webhook or controlled test
8. load ticket page
9. scan ticket on operator side
10. generate guardian link
11. request operator withdrawal
12. check planner dashboard company count
13. check revenue dashboard ledger-driven totals

## 9. Known Follow-Up Work

Still recommended after launch:

- fully webhook-first payment truth
- operator/company ownership wiring in UI permissions
- proper guardian watch page
- final premium UI polish pass
- route safety score
- demand radar

## 10. Launch Gate

AFAT is ready for a controlled rollout when:

- migrations are applied
- frontend and backend env vars are set
- signed ticket issue/scan works
- seat hold and booking creation work
- operator withdrawal requests log correctly
- company onboarding inserts real rows

At that point, launch a limited beta first, not a full public blast.
