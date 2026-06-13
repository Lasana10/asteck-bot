# AFAT Architectural Decisions

## Decision 1: Keep OSM/Leaflet-Centric Map Stack
- Reason: avoids restrictive commercial map lock-in and supports offline/open-data strategy.
- Tradeoff: requires more in-house map data tuning and tile strategy.

## Decision 2: Unified API + Supabase Hybrid Data Access
- Reason: fast product iteration while preserving backend control for sensitive workflows.
- Tradeoff: mixed access model increases consistency and auth-surface complexity.

## Decision 3: Render + Cloudflare Pages + Supabase as Core Infra
- Reason: cost-efficient launch stack with acceptable scale path.
- Tradeoff: cross-platform env/config drift risk if not tightly managed.

## Decision 4: Add Service Request + Dispatch Bridge Instead of Isolated Booking
- Reason: supports broader operations (taxi, bike, delivery, agency, special requests) with one ops model.
- Tradeoff: requires stricter schema and workflow governance to avoid complexity creep.

## Decision 5: Payment Readiness Endpoint + Provider Abstraction
- Reason: allows staged launch (stub/live/hybrid) while integrating real providers incrementally.
- Tradeoff: if not clearly surfaced in UI, users may assume full live payments too early.

## Decision 6: Source-of-Truth Memory Docs in `docs/`
- Reason: maintain continuity across long sessions and prevent execution drift.
- Tradeoff: docs must be continuously updated or they become stale.

## Decision 7: Prioritize Frontend Redesign Before Additional Backend Expansion
- Reason: current frontend does not reflect the intended AFAT quality level and weakens user/investor confidence even when backend endpoints exist.
- Tradeoff: some backend hardening tasks (for example payment live-mode and broader RBAC rollout) are intentionally deferred for a short focused UI/UX sprint.

## Decision 8: Keep Payment Integration in Stub/Readiness Mode Temporarily
- Reason: `PAYMENT_API_KEY` and provider onboarding can be completed after the frontend redesign baseline is accepted.
- Tradeoff: payment user flows remain non-live in production until provider credentials and webhook validation are completed.

## Decision 9: Add Shared Mission Control Before Full Visual Redesign
- Reason: the real problem is not only styling; the frontend was not clearly showing one coherent AFAT operating system across roles.
- Tradeoff: this is a structural product layer, not the final visual redesign. More screen-level cleanup is still required.

## Decision 10: AFAT Map Must Sit on an Owned Offline-First Data Foundation
- Reason: live updates should enrich a stable AFAT-controlled base map dataset rather than define the map by themselves.
- Reason: OSM-derived and locally prepared geospatial layers give AFAT more control over cost, legality, continuity, and multi-city scale.
- Tradeoff: this requires a real geospatial ingestion pipeline, storage strategy, and update governance instead of relying on ad hoc live map rendering.

## Decision 11: Remove Truth-Breaking Frontend Fallbacks Even If Screens Look Emptier
- Reason: fabricated departures, guest shells, and hidden demo map nodes make the product feel disconnected and weaken investor trust.
- Reason: it is better for AFAT to show "not yet published" or "planned" than to simulate operational depth that does not exist.
- Tradeoff: some screens will feel thinner until live data seeding and pack expansion catch up.

## Decision 12: Callback-First Payment Truth
- Reason: mobile money collection must not be treated as paid at button-click time; booking/payment truth should come from PawaPay callback or verified status polling.
- Reason: this keeps wallet crediting, boarding rules, and investor reporting aligned with real money state.
- Tradeoff: payment UX becomes more asynchronous and needs better pending-state handling in the frontend.

## Decision 13: Map Ingest Must Flow Through an AFAT Contract
- Reason: if telemetry, field reports, operator pings, and checkpoint signals bypass a common ingest path, the map will stay fragmented and hard to govern.
- Reason: `/api/ops/map-signal` creates the beginning of a controlled receive-normalize-publish pipeline.
- Tradeoff: more backend responsibility now, but much better scale, observability, and future AI use.

## Decision 14: AFAT Will Combine Machine Signals With Trusted Human Mesh
- Reason: bookings and passive telemetry alone are not enough to win the market on trust or speed.
- Reason: specific checkpoint stewards, enrolled area reporters, agencies, and authority-linked verifiers can improve coverage, cross-checking, and intervention quality.
- Tradeoff: enrollment, legal controls, training, and reputation systems become more important.

## Decision 15: Schema Must Chase the Live Product Contract, Not the Old Demo Contract
- Reason: backend and frontend work had outgrown the original base schema, which was causing live AFAT capabilities to depend on hidden migration drift.
- Reason: the reset schema and the incremental migration path now both need to describe payments, dispatch, checkpoint network, compliance, guardian, and seat-hold flows honestly.
- Tradeoff: the SQL surface becomes larger, but execution risk drops because future deployments and resets are less likely to resurrect old assumptions.

## Decision 16: Remove Hardcoded Map Intelligence From Role Dashboards
- Reason: hardcoded checkpoints in operator drive mode made the product look more advanced than the underlying data contract actually was.
- Reason: even partial live truth is more valuable than decorative intelligence if AFAT is positioning itself as infrastructure.
- Tradeoff: sparse live data will now be more visible until checkpoint seeding and steward enrollment grow.
