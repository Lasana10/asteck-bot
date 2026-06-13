# AFAT Current Status (as of June 11, 2026)

## What Currently Works
- Backend boots with security middleware, CORS allow-list, and `/health`.
- Core API surface exists for booking, dispatch, reporting, compliance, payments, tickets, guardian watch, and AI endpoints.
- Frontend has operational dashboards, map components, commuter/operator/admin flows.
- Frontend now includes a shared Mission Control layer across commuter/operator/planner/admin screens showing backend health, live map feed, payment readiness, compliance state, city selection, readiness score, and role-specific next actions.
- RegistrationHub frontend now collects a broader onboarding set for commuters, operators, government-linked operators, and companies/fleets instead of the earlier minimal field set.
- Operator and company onboarding now create compliance records automatically, giving planner/admin compliance views real follow-up items after registration.
- Strategic direction clarified: AFAT map intelligence should move toward an owned OSM-derived/offline-first base data layer with live updates layered above it.
- Frontend auth flow no longer drops unauthenticated users into a fake commuter shell; OTP verification now resolves to a real profile id and the frontend stores a usable local session anchor.
- Interactive map no longer hydrates from demo cached nodes; it now reflects AFAT feed inputs plus optional realtime overlays.
- Offline map controls now point to a real local asset-backed pack catalog based on shipped GeoJSON files, with planned packs shown as planned instead of pretending they already exist.
- Departure board no longer fabricates demo departures when the backend has none; empty-state messaging now tells the truth.
- Frontend now includes a shared AFAT Strategic Layer across commuter, operator, planner, and admin dashboards so the visible product finally surfaces onboarding/compliance, service lanes, special services, AI guidance, human verification, offline resilience, and the owned geodata foundation.
- Live map intelligence endpoint exists and is wired from frontend (`fetchLiveMapOps`).
- Broadcast and voice-report endpoints exist (previous missing-route blockers addressed).
- Service request and dispatch linkage exists (`/api/service/request` + `dispatch_assignments` relation).
- Repo now accepts both legacy and current Supabase env naming (`ANON/KEY` and `publishable/secret` aliases).
- Dashboard production build now completes successfully after pinning the Vite root/input and correcting missing PWA icon references.
- Live Render checks confirm `/health`, `/api/health`, and `/api/ops/live-map` are reachable (HTTP 200).

## What Is Broken / Risky
- Production reliability depends on correct env configuration across Cloudflare/Render/Supabase.
- Auth/RBAC is not fully enforced on all sensitive mutation endpoints.
- OTP verification still uses a mock verification code and is not yet production-safe identity verification.
- Some operational panels can show low/no data without seeded or live telemetry.
- Migration parity with live Supabase project is not yet fully certified from this workspace session.
- Payment provider readiness is still `mode: "stub"` (`pawapay:false`, `africastalking:false`) in live API response.
- Current frontend experience is still below final target quality, but the first coherence pass and strategic visibility layer are implemented and verified locally.
- Onboarding depth improved on the frontend, and operator/company registration now seeds compliance review items, but uploaded documents are still presentational and not yet stored as files.
- Current map rendering still relies on public tile services and app-level signals; the dedicated multi-city downloaded geodata foundation is only partially started through local asset-backed packs.

## Latest Deployment Status
- Code status in this workspace:
  - Branch: `sprint0-audit-fixes`
  - Recent commits include map, audit blocker fixes, and service request flow.
- Live deployment status must be re-verified directly in Render/Cloudflare dashboards after each push.

## Latest Test Results
- Latest successful local checks:
  - `npx tsc --noEmit` passed on June 11, 2026.
  - `dashboard` production bundle was rebuilt on June 11, 2026 and served locally from `dist/`.
- Full end-to-end smoke tests on live URLs should be rerun after next deployment.

## Compressed Handoff Snapshot
- Backend connectivity: live and reachable.
- Payment: intentionally deferred, remains stub/live-readiness pending.
- Frontend: redesign sprint is now priority #1 before deeper backend feature expansion.
- Frontend: role-unification plus the strategic visibility layer are complete; next pass should reduce remaining visual noise, deepen document persistence, and make the map/dispatch surface more operational.

## June 13, 2026 Addendum
- Auth progressed from a fake guest shell toward a signed local access token bridge. OTP is still mock-code based, but the backend now issues a local AFAT access token and the frontend stores it for backend-authenticated calls.
- Map transmission is no longer only a loose collection of direct Supabase writes. A dedicated backend ingest route now exists at `/api/ops/map-signal` for telemetry and field signals.
- Telemetry publishing was moved toward the AFAT backend contract so movement, incidents, and vehicle pings can be received, normalized, and then published back into live map, safety, and dispatch views.
- Live map feed contract is richer now: it returns data-contract metadata, transmission channels, geodata foundation info, signal freshness, and trust-state hints instead of only raw rows.
- Payment integration moved closer to a real PawaPay path. The backend now supports `PAWAPAY_API_TOKEN`, `PAWAPAY_ENV`, provider-readiness reporting, and callback-first confirmation logic.
- Mobile money flow is no longer marked paid immediately on frontend completion. Mobile collections now remain `collection_pending` until callback confirmation, while cash remains `cash_due`.
- Backend callback target for PawaPay sandbox should be: `https://asteck-bot.onrender.com/api/webhook/pawapay`
- Current reality: the product direction is stronger, but production auth hardening, callback validation, legal/compliance intake, and map-distribution depth are still unfinished.
- Database contract alignment advanced again:
  - `dashboard/src/lib/schema.sql` now includes checkpoint network, payment events, operator wallets, compliance, dispatch, guardian, and seat-hold tables in the base schema.
  - `db/unified_missing_updates.sql` now includes incremental SQL for new booking/payment/map fields plus checkpoint/payment-event tables and policies.
- Frontend map truth also improved:
  - operator drive mode no longer shows hardcoded checkpoint markers
  - commuter and operator dashboards now consume live `checkpoints` from `/api/ops/live-map`
  - the strategic layer and mission control now surface checkpoint counts as part of AFAT's visible operating model
- Latest verification on June 13, 2026:
  - backend `npx tsc --noEmit` passed
  - dashboard `npx tsc --noEmit` passed
  - dashboard production build passed
- Live Supabase schema catch-up SQL was run successfully by the user on June 13, 2026. The live project should now have the core tables/columns for `payment_events`, `checkpoints`, `checkpoint_memberships`, `operator_wallets`, expanded booking/payment states, incident verification fields, and movement accuracy.
