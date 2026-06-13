# AFAT Features Memory

## Completed Features
- Shared frontend Mission Control layer now mounted across commuter, operator, planner, and admin screens.
- Role-aware frontend action routing now connects visible planned features to existing flows (book, report, drive, dispatch, compliance/onboarding).
- Onboarding API now seeds compliance work items for operator and company registrations through `compliance_records`.
- Auth access flow now uses a real profile-backed local identity bridge instead of defaulting to a fake guest dashboard.
- Interactive map now uses AFAT feed truth first and only layers realtime telemetry where explicitly enabled.
- Offline map catalog now reflects shipped local geodata packs and exposes planned packs honestly.
- Departure board no longer injects fake departures when no routes are published.
- Shared AFAT Strategic Layer now appears across commuter, operator, planner, and admin dashboards, making service lanes, compliance packages, AI guidance, human verification, offline resilience, and geodata foundation visible in the frontend.
- Live map intelligence feed endpoint (`/api/ops/live-map`) and frontend consumption.
- Dispatch active feed and assignment endpoint.
- Broadcast endpoint exists and persists directives when possible.
- Voice report endpoint exists (mock/live branch).
- Seat hold flow (hold, release, create booking).
- Payment checkout/finalize flow with provider-readiness endpoint.
- Wallet ledger crediting on paid bookings.
- Secure ticket issue + boarding verification flow.
- Guardian token creation + watch endpoint.
- Service request workflow (`/api/service/request`) with optional auto-dispatch.
- SOS panic endpoint writes emergency payload and attempts persistence.

## In-Progress Features
- Frontend redesign sprint (layout coherence, flow clarity, map/dispatch interaction quality, investor-grade polish). First pass completed: live readiness/control layer plus strategic visibility layer added.
- End-to-end onboarding reliability across passenger/driver/company. Frontend registration fields expanded and backend now persists onboarding context plus compliance queues for operator/company flows.
- Compliance lifecycle dashboard and action workflows.
- Production-grade realtime dispatch/map data quality across cities.
- AFAT geodata foundation beyond the first local asset-backed packs.
- AI operational copilot behavior quality and model routing.
- Callback-first mobile money collection with PawaPay sandbox/prod env support and proper booking status transitions.
- Backend-authenticated map-signal ingest for telemetry, checkpoints, incident reports, and operator pings.
- Live checkpoint network ingestion and publication path now exists:
  - `/api/ops/checkpoints`
  - `/api/ops/checkpoints/enroll`
  - `/api/ops/live-map` now returns checkpoint markers
- Operator drive mode and commuter map now consume live checkpoint data instead of hardcoded checkpoint placeholders.
- Strategic layer and Mission Control now expose checkpoint counts as part of visible map readiness.

## Planned Features
- Strong role-based operations layer (commuter/driver/operator/company/admin).
- Compliance packages and document lifecycle automation.
- City-scale map intelligence: hazard/risk overlays and routing intelligence.
- Offline-first resilience improvements from current PWA baseline.
- Multi-tenant operator/company service plans and analytics.
- AFAT-owned geospatial base layer built from downloaded/open data with live operational enrichment.
- Structured checkpoint network and verified area stewards for human cross-checking and higher-trust city coverage.
- Regional replication pack for each city: onboarding, dispatch, compliance, reporting, and local map packs as repeatable rollout modules.

## Blocked Features
- Live payment collection is intentionally paused pending redesign acceptance and provider credential finalization.
- Frontend can now display payment readiness truthfully, but true payment collection remains provider-credential blocked.
- Any feature requiring missing production env keys (Supabase/public keys, payment keys, etc.).
- Features depending on un-applied Supabase migrations/RLS policies.
- Fully trusted investor demo state until frontend/backend env parity is verified in deployment.
