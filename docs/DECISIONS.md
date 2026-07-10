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

## Decision 17: Keep Role-Switching Visible Only In Local QA
- Reason: the app should not spend precious interface space narrating the user's identity in normal sessions when the goal is operational flow clarity.
- Reason: QA still needs fast role switching on localhost to inspect commuter, operator, planner, and admin surfaces without waiting on real auth states.
- Tradeoff: developers lose some always-visible role context in normal browsing, but the product feels less like a demo shell.

## Decision 18: Make Negotiation Booking-Linked Before Making It Bigger
- Reason: a smaller real workflow is more valuable than a larger fake negotiation experience.
- Reason: tying operator negotiation to `bookings` and `negotiations` gives AFAT a real audit trail and a path to accepted-fare settlement.
- Tradeoff: commuter-side bargaining remains asymmetrical for now, because the pre-booking passenger UX still needs a deeper lifecycle design.

## Decision 19: Role Entry Must Preserve User Intent Before Profile Resolution
- Reason: AFAT has different user types, and a phone session without a profile should not silently become a generic commuter experience.
- Reason: capturing access intent before OTP lets onboarding route directly into commuter, operator, company/planner, or government-linked tracks.
- Tradeoff: this adds a small amount of client-side state, so backend role guards still need to remain the source of authority for protected actions.

## Decision 20: Admin Must Act On Queues, Not Only See Dashboards
- Reason: special access is only valuable if admin can adjudicate compliance, review map truth, copy/payment-check callbacks, enroll checkpoints, and prepare directives from one operational desk.
- Reason: investor-grade credibility comes from visible receive -> review -> act loops, not from static metrics.
- Tradeoff: some queues are now visible before the complete backend lifecycle exists, so staged areas must stay labeled honestly until persistence, scoring, rewards, and audit trails are complete.

## Decision 21: Movement Logs Stay Raw, Reviews Become Human Validation
- Reason: `movement_logs` should remain the raw signal substrate for telemetry and campaign inputs.
- Reason: `map_signal_reviews` creates a separate audit trail for admin/steward judgment, confidence, publication, and contributor reward.
- Tradeoff: route-truth data now has one more table to join, but the receive/review/publish model is much cleaner and scales better across cities.

## Decision 22: Prepare AFAT For Provider Mobility From Now
- Reason: the team may keep using managed platforms while building, but the system should be designed so database, auth, storage, queues, and frontend delivery can move without a rewrite.
- Reason: avoiding provider lock-in is especially important for data sovereignty, regional expansion, and future cost control.
- Tradeoff: this requires stricter internal contracts now: backend-owned auth/session logic, migration-first schema discipline, storage abstraction, and no frontend dependence on provider-specific behavior.

## Decision 23: Notifications Must Be System Infrastructure, Not Just UI Feedback
- Reason: dispatch, compliance, map-construction notices, and urgent ops events need one AFAT-controlled delivery spine instead of each feature inventing its own message path.
- Reason: centralizing in-app, WhatsApp, Telegram, and email fan-out keeps future provider swaps and auditability manageable.
- Tradeoff: delivery truth is now better structured, but channel success still depends on linked contact data and live provider env configuration.

## Decision 24: Do Not Pretend Email Auth Is Finished Before The Login Contract Changes
- Reason: the current login surface is still phone-first, and bolting in a hidden email path would create another fake-complete auth branch.
- Reason: it is better to wire SMTP cleanly first, then deliberately add email OTP UX and backend verification when we choose that path.
- Tradeoff: temporary bootstrap access remains necessary while SMS provider onboarding is blocked.

## Decision 25: Prefer Supabase Email Access Over A New Custom Email Auth Layer
- Reason: AFAT already depends on Supabase, and Supabase Auth can provide email OTP / magic-link access, user/session handling, and profile linkage without creating another bespoke auth service.
- Reason: this keeps auth, future storage, and realtime closer together while the platform is still stabilizing.
- Tradeoff: live behavior now depends on correct Supabase Auth configuration and its supported email flow semantics.

## Decision 26: Keep Supabase As AFAT Core; Use Firebase Only For Mobile Add-Ons If Needed
- Reason: AFAT core data is relational, permissioned, and audit-heavy: profiles, roles, vehicles, permits, bookings, incidents, payments, checkpoints, dispatches, and compliance reviews need SQL joins, migrations, constraints, and RLS-friendly authorization.
- Reason: Supabase keeps Postgres, Auth, Storage, Realtime, and a future self-hosting path closer together, which better matches AFAT's data-sovereignty and provider-mobility goals.
- Reason: Firebase is still useful later for mobile-specific services such as push notifications, Crashlytics, Analytics, Remote Config, or limited realtime client presence, but Firestore should not replace the operational system of record now.
- Tradeoff: Supabase requires stricter schema/RLS discipline and correct email/SMTP/Auth configuration, but switching core data to Firebase now would add a major rewrite and make compliance-grade reporting harder.
