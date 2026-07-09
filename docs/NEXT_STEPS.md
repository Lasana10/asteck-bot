# AFAT Next Steps

## Immediate Next Tasks
1. Continue the functionality-completion pass behind the now-green frontend build:
   - align live frontend deployment branch with the code that contains the new auth flow:
     - Cloudflare production must not build `master` if the auth work remains on `sprint0-audit-fixes`
     - but branch switching alone is not enough if the current `Email OTP` UI changes are still only local modifications
     - first reconcile the current dirty `sprint0-audit-fixes` worktree enough to commit and push the auth/frontend changes
     - then redeploy Cloudflare from the updated `sprint0-audit-fixes` branch
   - browser-test the new email access flow for one real address:
     - request email access
     - complete sign-in by code or link
     - confirm AFAT lands on the correct profile/role state
   - set live envs for `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_PERMANENT_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`, `EMAIL_SMTP_SERVER`, `EMAIL_SMTP_PORT`, `EMAIL_SENDER_ADDRESS`, and `EMAIL_APP_PASSWORD`
   - smoke-test `/api/ops/notifications/send` against one allowlisted admin/operator profile and verify in-app + channel fan-out
   - apply the new `map_signal_reviews` migration to live Supabase and QA admin route-truth review actions
   - apply the new auth tables (`auth_otp_challenges`, `auth_refresh_sessions`) to live Supabase
   - set production OTP provider envs and smoke-test `/auth/send-otp`, `/auth/verify-otp`, `/auth/refresh`, and `/auth/me`
   - if provider registration remains blocked, use the new env-driven bootstrap access path temporarily and remove it once OTP is fully live
   - keep the temporary bootstrap path short-lived once Supabase email access is verified live
   - only extend the custom SMTP layer into a backend-owned email OTP flow if Supabase email auth proves operationally insufficient
   - keep Redis optional for later portability/performance; do not introduce it yet unless refresh/session scale or queue durability actually requires it
   - finish document/file storage for compliance packages
   - deepen payment audit and PawaPay callback verification
   - add backend-backed workflows for academy/certification and emergency logistics
   - enforce role guards on sensitive admin/operator/planner actions
2. Browser QA every role from the unified access flow:
   - sign in/register as commuter, operator, planner/company, and admin
   - confirm each bottom-nav tab opens the right workspace
   - classify any remaining button as live action, staged action, planned feature, or bug
3. Backend verification after the local PawaPay webhook-hardening edits:
   - run backend typecheck/build
   - deploy/restart Render only after green checks
   - test `https://asteck-bot.onrender.com/api/webhook/pawapay` with sandbox callback payloads and secret configuration
4. Add real review tables/workflows for map intelligence:
   - `map_signal_reviews`
   - validation status
   - steward/admin reviewer
   - confidence score update
   - contributor reward eligibility
   - publish/dismiss history
5. Keep memory files updated before every context compression or major handoff.
6. Keep infrastructure portable while building:
   - backend-owned auth/session contract
   - migration-first Postgres discipline
   - storage abstraction for files/assets
   - queue/cache abstraction
   - no production reliance on QA-only frontend shortcuts

## Previous Immediate Tasks
1. Continue frontend redesign sprint from the Mission Control and Strategic Layer baseline: simplify home screens, reduce fake-static claims, and make the map/dispatch layer feel like the primary product.
2. Run a full click-through QA pass in the browser for commuter, operator, planner, and admin roles: every visible button should be classified as live backend action, local workflow, external link, or planned/staged.
3. Confirm the dashboard is opened on the frontend preview URL, not the backend API URL (`localhost:3000`), before judging frontend role behavior.
4. Deepen the new negotiation system:
   - decide whether commuter negotiation should stay post-seat-hold or move earlier in the flow
   - add accepted/rejected history rendering and final-state UI
   - verify RLS/session behavior for Supabase negotiation inserts in production auth
5. Build real document persistence for onboarding/compliance so the visible packages become stored files, review statuses, expiry tracking, and admin actions.
6. Convert the next highest-risk staged workflows into backend-backed actions: tontine contribution posting, academy/certification queue, emergency logistics directives, admin profile review, and payment audit.
7. Build the next geodata step after the local pack catalog: add curated city manifests, route graph loading, and a visible distinction between ready packs and planned packs across all roles.
8. Design and implement deeper onboarding/compliance tracks for commuters, drivers, companies, agencies, deliveries, taxis, and bikes.
9. Keep backend stable while redesigning: no broad new backend scope unless required by redesigned UX.
10. After redesign pass, run live smoke tests for:
   - onboarding
   - booking + seat hold + payment finalize
   - dispatch assignment + live map update
   - reporting + broadcast + SOS
11. Run Supabase migration parity check and apply any missing SQL in correct order.
12. Add centralized JWT auth middleware and role guards on protected endpoints.
13. Replace mock OTP flow with real provider-backed verification.
14. Design AFAT geospatial foundation:
   define downloaded OSM-derived data sources, preparation pipeline, storage format, tile strategy, and how live fleet/incident overlays attach to it.
15. Browser-QA the simplified operator workspaces:
   confirm Home, Requests, Intel, Profile, negotiation modal, QR generator, ticket scanner, history, withdrawal, and tontine overlays all open from the right contexts.
16. Convert commuter geo missions from visible intent into a real pipeline:
   submission capture, steward/admin review, trust scoring, route-pack update eligibility, and contributor rewards.
17. Add planner/admin review for published commuter mission signals:
   recent signal queue, trust-state labeling, and a fast review action to validate or dismiss collected route-truth data.
18. Add a real Cloudflare deployment path in-repo:
   install/configure `wrangler`, add deployment config, verify build output target, and connect the dashboard workspace to the intended Cloudflare Pages or Workers project.

## June 13, 2026 Strategic Next Step
1. Replace mock OTP with a real provider-backed verification path and signed backend session model.
2. Add callback verification and persistence around PawaPay: payment events table, callback signature checks if supported, pending/retry monitoring, and admin payment audit view.
3. Expand `/api/ops/map-signal` into a real ingestion pipeline with typed sources:
   `telemetry`, `checkpoint`, `incident`, `operator_ping`, `agency_report`, `authority_signal`.
4. Create a checkpoint/steward program model:
   enrolled checkpoint actors, assigned zones, trust scores, escalation rights, legal acceptance, and reporting channels.
5. Add map distribution intelligence:
   ingestion -> validation -> trust scoring -> prioritization -> broadcast -> route guidance -> admin review loop.
6. Build rollout replication kits per region:
   city pack, onboarding pack, compliance pack, operator pack, checkpoint pack, and reporting pack.
7. Apply the updated SQL to Supabase so the new `payment_events`, `checkpoints`, `checkpoint_memberships`, `operator_wallets`, and booking-status fields exist in the live database rather than only in workspace files.
8. Add planner/admin checkpoint surfaces:
   checkpoint readiness, steward enrollment review, trust-score monitoring, and corridor coverage gaps.
9. Build the first real checkpoint enrollment UX:
   capture location, area, legal acknowledgement, actor role, and trust pathway from the app.

## Concise Project Handoff Summary
- AFAT is no longer only thinking about a pretty live map. The real winning system is becoming clearer: receive data well, validate it well, publish it well, and use it to make transport faster, safer, and more reliable.
- Current implemented progress: stronger frontend visibility, map ingest endpoint, richer live map contract, early signed local auth bridge, and better PawaPay direction.
- Current missing core: real auth, verified callback-first payments, serious map intelligence pipeline, document/legal support flows, and repeatable multi-region operating model.
- Current frontend quality gap: local navigation is improving, but every role still needs end-to-end browser QA with screenshots and backend request verification before investor demo.

## Highest Priority Tasks
- Frontend redesign quality uplift to match AFAT product ambition.
- Convert the new cross-role readiness/control layer into a more polished operational shell.
- Frontend/backend deployment parity to eliminate disconnected user experience.
- Replace the current map-demo posture with a true AFAT-controlled geospatial base layer.
- Data hydration strategy (seed + realtime) so dashboards never appear empty.

## Technical Debt
- Mixed frontend direct-Supabase and backend-proxied mutations without uniform policy.
- Duplicate/overlapping SQL migration files needing consolidation.
- Inconsistent runtime assumptions between local/dev/prod environments.

## Product Priorities
- Reliable onboarding for commuters, drivers, companies.
- Trustworthy dispatch and map intelligence experience.
- Stable payment UX (even if provider rollout is phased).
- Compliance workflow foundations for operator/company retention.

## Concise Handoff Summary
- We now have a formal AFAT memory system under `docs/` as source of truth.
- Core architecture and major APIs are in place.
- Active decision: redesign frontend first, hold payment live-mode and some deeper backend hardening until redesign baseline is accepted.
