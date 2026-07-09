# AFAT Current Status (as of July 9, 2026)

## July 9, 2026 Deployment Truth Addendum
- The frontend code in the local `sprint0-audit-fixes` worktree does include the `Email OTP` lane:
  - `dashboard/src/App.tsx` renders both `Phone OTP` and `Email OTP`
  - `dashboard/src/supabaseClient.ts` includes `sendEmailOtp(...)` and `verifyEmailOtp(...)`
- Supabase/Auth infrastructure appears aligned for that path:
  - Email provider is enabled
  - Site URL is `https://asteck-bot.pages.dev`
  - Redirect URLs include `https://asteck-bot.pages.dev` and `http://127.0.0.1:4191`
  - Cloudflare build-time envs for `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` are now present
- Important truth:
  - the live site still not showing `Email OTP` means production is serving code older than the current local auth work
  - changing Cloudflare production from `master` to `sprint0-audit-fixes` only solves part of that problem if the local auth changes have not yet been committed and pushed to `origin/sprint0-audit-fixes`
  - current local git state confirms the branch is `sprint0-audit-fixes`, but the email-auth/frontend work remains in modified local files rather than a new pushed branch commit
  - next live move is no longer only “switch branch”; it is “commit/push the current auth frontend changes, then redeploy Cloudflare from that updated branch”
- Later July 9 operational follow-up:
  - dashboard production build passed with elevated filesystem access after the local OneDrive/sandbox output cleanup issue was isolated
  - the built bundle contains `Email OTP`, `Phone OTP`, and `Request Email Access Link`, confirming the source and generated frontend now expose the email lane
  - a fresh static preview is running at `http://127.0.0.1:4192/`; the previous `http://127.0.0.1:4191/` view should be treated as stale until restarted
  - planner infrastructure controls were changed to AFAT-native operational buttons instead of exposing third-party backend/tool names to users
  - onboarding backend now normalizes Cameroon phone numbers and resumes/updates existing passenger, driver, and company profiles instead of failing hard on duplicate phone numbers

## July 10, 2026 Stability Follow-up
- Local preview instability was traced to two practical causes:
  - `http://127.0.0.1:4191/` could remain an older static process
  - PWA service-worker caching could keep serving stale frontend assets even after a rebuild
- The current local preview should use `http://127.0.0.1:4192/`, which now serves the rebuilt production bundle with `assets/index-BhZqwuoa.js` and `assets/index-ezEeUyCF.css`.
- Login now defaults to `Email OTP` because SMS provider activation is still blocked, while phone/bootstrap remains available as a secondary lane.
- Local previews now unregister service workers on `localhost` and `127.0.0.1` so the browser stops showing stale login code.
- Global decorative motion was reduced so AFAT feels operational and stable rather than shaky:
  - infinite mesh, marquee, radar, float, hero pan, live/neon, particle, and pulse-ring animations are disabled by default
  - pulse/ping/bounce effects are shortened and capped
  - reduced-motion users get near-static transitions and animations

## July 7, 2026 Supabase Email Access Addendum
- AFAT login now has a real Supabase email access lane in the frontend alongside the existing phone lane.
- The login surface now lets the user choose:
  - access lane (`commuter`, `operator`, `planner`, `admin`)
  - access channel (`phone OTP` or `email OTP`)
- Email access is implemented through Supabase Auth:
  - `signInWithOtp` sends the access email
  - `verifyOtp` supports entered email OTP codes
  - app boot now also recognizes Supabase-authenticated sessions, not only AFAT backend-issued sessions
  - a Supabase auth-state listener now hydrates AFAT role/profile state when an email sign-in completes by code or secure link
- Important truth:
  - this is a real email-auth path, but it still depends on live Supabase Auth email configuration and redirect URL correctness
  - the custom AFAT phone/bootstrap path still exists for blocked-SMS periods
  - Supabase dashboard now appears correctly configured for this path:
    - Email provider enabled
    - Site URL set to `https://asteck-bot.pages.dev`
    - Redirect URLs include `https://asteck-bot.pages.dev` and `http://127.0.0.1:4191`
  - Cloudflare build-time frontend variables now appear configured in the static-assets Worker build section:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_PUBLISHABLE_KEY`
    - `VITE_SUPABASE_ANON_KEY`
    - `VITE_API_URL`
  - Remaining live blocker: Cloudflare production is still pointed at `master`, while the newer AFAT auth/frontend work is currently on `sprint0-audit-fixes`.

## July 6, 2026 Notifications + Auth Continuation
- Backend/frontend verification is green again:
  - backend `npx tsc --noEmit` passed
  - dashboard `npm run build` passed
- AFAT now has a real notification spine instead of only scattered UI feedback:
  - new backend services exist for `EmailService`, `MetaWhatsAppService`, and centralized `NotificationService`
  - system notifications can now fan out through `in_app`, `whatsapp`, `telegram`, and env-driven `email`
  - admin field notices are no longer just staged text; the admin desk can now send role/city-targeted operational notices through `/api/ops/notifications/send`
- Sensitive workflow integration improved:
  - dispatch assignments now trigger real operator notifications
  - compliance status changes now trigger real target-profile notifications
  - frontend backend calls for dispatch/compliance/service requests now carry AFAT auth headers instead of silently missing the new RBAC layer
- Important truth:
  - WhatsApp and email are now positioned as system channels first, not fake “done” auth replacements
  - email OTP fallback is still not a finished user-facing auth path because the current login surface remains phone-first
  - the new email/WhatsApp providers are env-driven so credentials can be rotated later without code changes

## July 3, 2026 Handoff Addendum
- Frontend build is currently green: `npm run build` passed in `dashboard/` and generated new PWA assets.
- Unified auth/role entry has advanced: users now choose an access lane before OTP, the intended lane is persisted, and missing-profile phone sessions open the matching registration track instead of silently falling into a generic commuter fallback.
- `RegistrationHub` now supports direct track entry and phone prefill, so commuter/operator/company/admin-linked onboarding can be opened intentionally from access flow or QA review.
- Admin Intelligence Desk is more operational:
  - compliance records can be marked `verified`, `needs_followup`, or `rejected` through the backend compliance-status helper
  - recent route-truth/campaign signals from `/api/ops/live-map` are displayed in admin and can be queued for review as broadcast/directive work
  - payment readiness, backend target, checkpoint enrollment, map-construction notices, and AI orchestrator launch points remain centralized in the same desk
- Route-truth review is now backend-backed locally:
  - new `map_signal_reviews` schema and incremental migration entries exist
  - `/api/ops/map-signal-reviews` can queue, validate, dismiss, or publish movement-log signals
  - validated/published signals can award trust points through the existing `award_points` RPC
  - `/api/ops/live-map` now returns `review_status`/`review` metadata for campaign signals
  - admin route-truth buttons now call the backend instead of only staging text
- PawaPay webhook hardening was started in backend routes: callback secret validation and payment-event deduplication logic were added locally, but backend deploy/build verification still needs to be completed before calling it production-ready.
- Current honest state: AFAT is now much less decorative, but not every ecosystem feature is fully operational. The highest remaining work is still finishing backend-backed workflows behind staged ecosystem areas: document/file storage, academy/certification, emergency logistics, payment audit, full map validation/reward loop, and stronger RBAC.

## July 4, 2026 Authentication Addendum
- AFAT auth is now more real and backend-owned:
  - OTP challenges are no longer only in memory; schema and incremental SQL now include `auth_otp_challenges`
  - refresh-token sessions now have a dedicated table: `auth_refresh_sessions`
  - backend now exposes `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/auth/refresh`, `/api/auth/me`, and `/api/auth/logout` as a coherent AFAT auth contract
  - access tokens are short-lived AFAT-signed tokens, while refresh sessions persist separately
  - frontend boot now prefers AFAT auth session lookup and refresh before falling back to local QA identity
- OTP provider routing is now configurable:
  - `OTP_PROVIDER=termii` uses Termii
  - `OTP_PROVIDER=arkesel` uses Arkesel
  - if no provider is configured, development fallback is allowed only outside production
- Termii support was added locally with provider send/verify integration and provider reference storage on auth challenges.
- A temporary broad bootstrap-access path now exists locally for blocked provider periods:
  - allowlisted phones can use a general access code for `commuter`, `operator`, `planner`, or `admin`
  - a separate admin-only bootstrap code can still exist for tighter admin recovery
  - this is env-driven and not hardcoded in source
- RBAC hardening has started on top of AFAT auth:
  - map-signal review writes now require `admin` or `planner`
  - report status updates now require `admin` or `planner`
  - compliance status updates now require `admin` or `planner`
  - dispatch assignment now requires `admin`, `planner`, or `operator`
- Admin now has direct dispatch capacity in the Intelligence Desk:
  - admin can create manual dispatch assignments by operator id or vehicle id
  - this no longer lives only under planner flows
  - admin can now direct field registration, route-truth review, compliance action, and dispatch from one surface

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
- Local review mode now appears on localhost so AFAT can be opened and inspected as commuter, operator, planner, or admin during development.
- Strategic Layer now includes an ecosystem readiness board for active, in-progress, and planned layers: operational core, compliance gateway, map moat, payments, academy/certification, cross-border, social trust, and humanitarian logistics.
- Admin dashboard now includes a command matrix that makes special access useful for compliance/permits, PawaPay callback readiness, map quality, regional rollout, academy/certification, and emergency logistics direction.
- OTP backend flow now attempts Arkesel verification when `ARKESEL_API_KEY` is present and limits the `123456` fallback to development/no-provider mode.
- AI orchestration is now more visible in the frontend: the copilot button is labeled as an orchestrator, dashboard surfaces can open it directly, and the panel now exposes visible strategy/guidance stages instead of hiding all orchestration behind a generic chat icon.
- Admin compliance/intelligence actions now open a dedicated desk with payment callback, compliance pressure, rollout guidance, and orchestrator launch controls.
- Admin also now has an explicit map-construction field desk for checkpoint registration and targeted map-data crew notices.
- Frontend action coherence pass continued: commuter scan/pay errors, SOS/wallet access, payment success, admin broadcast/export, operator tontine contribution, planner mission actions, and planner report controls now use inline product feedback or navigate to the relevant workflow instead of browser alerts, console-only success, or dead-feeling buttons.
- Planner mission buttons now jump to Report Center, Compliance Radar, Dispatch Workbench, or Jurisdiction Heatmap. Report actions are labeled Verify, Resolve, and Dismiss and call the backend status update path.
- Admin Global Patch now opens the Intelligence Desk instead of only staging a loose message.
- A small static preview helper exists at `dashboard/scripts/static-preview.cjs` for serving `dashboard/dist` when Vite preview refuses to stay attached.
- Local review shell has been reduced to a QA-only workspace strip instead of a big identity/passport layer; production sessions now keep more focus on the real product surface.
- Planner/admin bottom navigation now drives real movement: planner tabs scroll to map/report/compliance surfaces, and admin tabs open command, analytics, alert map, or intelligence desk surfaces instead of only changing active tab state.
- Operator request handling is stronger: live request cards now expose payment/negotiation state, negotiation writes to the `negotiations` table, and accepted negotiated fares can be written into `bookings.price_paid`.
- Commuter booking surface now makes negotiation and special-service intent visible instead of behaving like a plain route search only.
- Operator navigation is more truthful now: `bookings` opens a real Requests workspace and `notifications` opens a real Intel workspace rather than just scrolling around a mega-screen.
- Operator Home is now closer to a shift console: first-screen weight is on wallet/shift/vehicle/drive actions, while requests and intel have their own spaces.
- Geodata foundation work has started to become operational in the frontend: map packs now carry prep-stage metadata and commuter Home surfaces AFAT route-truth missions tied to pack preparation.
- Commuter route-truth missions now publish real map signals to `/api/ops/map-signal`, and planners can see those mission signals in the live signal stream when the backend returns them.
- Planner language and map alignment are stronger now: the planner side speaks AFAT operationally, not like a tool dashboard, and its map role is no longer mislabeled as admin.
- Live map intelligence endpoint exists and is wired from frontend (`fetchLiveMapOps`).
- Broadcast and voice-report endpoints exist (previous missing-route blockers addressed).
- Service request and dispatch linkage exists (`/api/service/request` + `dispatch_assignments` relation).
- Repo now accepts both legacy and current Supabase env naming (`ANON/KEY` and `publishable/secret` aliases).
- Dashboard production build now completes successfully after pinning the Vite root/input and correcting missing PWA icon references.
- Live Render checks confirm `/health`, `/api/health`, and `/api/ops/live-map` are reachable (HTTP 200).

## What Is Broken / Risky
- Production reliability depends on correct env configuration across Cloudflare/Render/Supabase.
- Auth/RBAC is not fully enforced on all sensitive mutation endpoints.
- OTP is improved but still needs production smoke testing with Arkesel credentials and centralized role guards before being considered production-safe.
- Some operational panels can show low/no data without seeded or live telemetry.
- Migration parity with live Supabase project is not yet fully certified from this workspace session.
- Last checked live payment provider readiness still returned old/stub behavior, likely because the latest backend code was not yet pushed/deployed/restarted with Render env parity.
- Current frontend experience is still below final target quality, but the first coherence pass and strategic visibility layer are implemented and verified locally.
- Several buttons that previously felt dead now provide visible feedback or open working overlays, but some deeper actions still stage work rather than completing a backend workflow. This is intentional truthfulness until dedicated backend workflows exist.
- Build verification in this sandbox is still noisy: `vite build` can hit a protected-directory resolution problem even though `dashboard/vite.config.js` exists locally, so the next clean build should be verified outside the restricted shell.
- The operator home screen is better separated now, but still needs browser QA for spacing, mobile density, and action hierarchy.
- Geo preparation is still early: we now have visible mission orchestration, but not yet the full submit -> verify -> score -> publish pipeline.
- Mission publish now exists for commuter route-truth signals, but the full verify -> score -> reward loop still needs backend review and trust scoring.
- Cloudflare deployment from this workspace is not ready yet: no local `wrangler` command or Cloudflare deployment config is present in the repo, so deploy execution is currently an environment blocker rather than a product blocker.
- Local frontend/backend truth remains mixed until `VITE_API_URL` is intentionally pointed at Render or a local backend is kept running, because localhost builds default to `http://localhost:3000`.
- Onboarding depth improved on the frontend, and operator/company registration now seeds compliance review items, but uploaded documents are still presentational and not yet stored as files.
- Current map rendering still relies on public tile services and app-level signals; the dedicated multi-city downloaded geodata foundation is only partially started through local asset-backed packs.
- Admin access is stronger visually and operationally, but licensing decisions, compliance adjudication, payment audit trails, map quality review queues, academy/certification, and regional rollout controls still need full backend-backed workflows.
- Email delivery is now wired without an external package, but it still needs live SMTP credential verification in deployment before being treated as production-ready.
- WhatsApp notification delivery now targets Meta Cloud API envs, but live delivery depends on correct phone-number-id/token setup and recipient-linked numbers.
- Supabase email access is now implemented locally, but browser/live verification depends on Supabase Auth email settings and the existing known local build-path sandbox issue.
- Live frontend parity still depends on deploying the branch that contains the current auth work; env alignment alone is not enough if Cloudflare serves an older branch.

## Latest Deployment Status
- Code status in this workspace:
  - Branch: `sprint0-audit-fixes`
  - Recent commits include map, audit blocker fixes, and service request flow.
- Live deployment status must be re-verified directly in Render/Cloudflare dashboards after each push.

## Latest Test Results
- July 7, 2026:
  - backend `npx tsc --noEmit --pretty false` passed after Supabase email-access frontend integration
  - dashboard production build remains blocked by the pre-existing sandbox/path-resolution issue (`Cannot read directory "../../.."` / `Could not resolve ... vite.config.js`), so this change still needs in-browser/live verification rather than relying on this shell's build result
- July 6, 2026:
  - backend `npx tsc --noEmit` passed after notification-system and auth-header propagation changes
  - dashboard `npm run build` passed after admin field notifications and secured backend-call updates
- July 3, 2026:
  - dashboard `npm run build` passed after route-truth review UI/API helper changes
  - backend `npx tsc --noEmit` passed after map-signal review route changes
- Latest successful local checks:
  - backend `npx tsc --noEmit` passed on June 18, 2026 after Arkesel/auth and PawaPay readiness changes.
  - dashboard `npx tsc --noEmit` passed on June 18, 2026 after the latest ecosystem-readiness UI patch.
  - dashboard production bundle was rebuilt on June 18, 2026 and served locally from `dist/`.
  - dashboard `npm run build` passed on June 20, 2026 after the button/action coherence pass. Latest assets include `assets/index-CoprcxYh.js` and `assets/index-C24zkX0R.css`.
- Known local-preview issue:
  - `http://127.0.0.1:4191/` was not running after the build. Detached preview attempts exited in this shell, although `dashboard/scripts/static-preview.cjs` runs correctly in foreground and the built `dist` output is valid.
- June 22, 2026 build note:
  - `npm run build` generated new dashboard assets `assets/index-CkY_ub3U.js` and `assets/index-Tl-fJaNm.css`, and `dist/index.html` points to them.
  - The build command timed out from the tool before returning a clean final status, so this is treated as "assets generated, final command status not fully observed" rather than a perfect green verification.
- Full end-to-end smoke tests on live URLs should be rerun after next deployment.
- June 25, 2026 implementation note:
  - frontend shell reduced role narration in normal sessions
  - bottom navigation labels made clearer across roles
  - operator negotiation path is now booking-linked instead of purely simulated
  - commuter booking page now advertises live negotiation and special-service booking direction
  - operator Requests and Intel tabs became real workspaces
  - operator Home was simplified toward current shift, earnings, vehicle state, and drive entry

## Compressed Handoff Snapshot
- Backend connectivity: live and reachable.
- Payment: intentionally deferred, remains stub/live-readiness pending.
- Frontend: redesign sprint is now priority #1 before deeper backend feature expansion.
- Frontend: role-unification plus the strategic visibility layer are complete; next pass should reduce remaining visual noise, deepen document persistence, and make the map/dispatch surface more operational.
- Next non-negotiable: open local AFAT at `http://127.0.0.1:4191/`, enter through local review mode, inspect each role, and fix the missing admin/map/auth/payment workflows before pushing.

## June 13, 2026 Addendum
- Auth progressed from a fake guest shell toward a signed local access token bridge. OTP is still mock-code based, but the backend now issues a local AFAT access token and the frontend stores it for backend-authenticated calls.
- Map transmission is no longer only a loose collection of direct Supabase writes. A dedicated backend ingest route now exists at `/api/ops/map-signal` for telemetry and field signals.
- Telemetry publishing was moved toward the AFAT backend contract so movement, incidents, and vehicle pings can be received, normalized, and then published back into live map, safety, and dispatch views.
- Live map feed contract is richer now: it returns data-contract metadata, transmission channels, geodata foundation info, signal freshness, and trust-state hints instead of only raw rows.
- Payment integration moved closer to a real PawaPay path. The backend now supports `PAWAPAY_API_TOKEN`, `PAWAPAY_ENV`, provider-readiness reporting, and callback-first confirmation logic.
- Mobile money flow is no longer marked paid immediately on frontend completion. Mobile collections now remain `collection_pending` until callback confirmation, while cash remains `cash_due`.
- Backend callback target for PawaPay sandbox should be: `https://asteck-bot.onrender.com/api/webhook/pawapay`
- Current reality: the product direction is stronger, but production auth hardening, callback validation, legal/compliance intake, document storage, contribution posting, and map-distribution depth are still unfinished.
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
