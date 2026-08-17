# AFAT Bugs Memory

## Open Bugs
1. Frontend can fall back to placeholder Supabase URL when env vars are missing.
2. OTP flow is mock-based (`123456`) and not production-auth secure.
3. Auth/RBAC is not consistently enforced on all mutating API routes.
4. Payment flow lacks strong idempotency guarantees for retries.
5. Data emptiness in some ops cards can make platform appear inactive without seed/live telemetry.
6. Service worker/offline behavior needs deployment-level verification for all promised map modes.
7. Mission Control currently depends on client-side endpoint polling and does not yet share a central cached status store.
8. Detached local preview server does not stay alive in this Codex shell, even though the static preview server runs in foreground.
9. Some ecosystem buttons are staged rather than fully live backend workflows, especially academy/certification, emergency logistics, document storage, and tontine contribution posting.
10. Negotiation persistence now exists for operator-side booking threads, but commuter-side pre-booking negotiation is still simplified and not yet a fully symmetric marketplace flow.
11. Sandbox build verification can fail with a protected-directory resolution error even when local dashboard files are present, making frontend verification noisier than it should be.
12. Some files had interrupted-edit import corruption during the July 3 pass; `App.tsx` and `RegistrationHub.tsx` were repaired and the dashboard build is green, but future interrupted edits should trigger an immediate build check.
13. Admin route-truth review now has a dedicated local `map_signal_reviews` workflow, but live Supabase still needs the migration applied and browser QA before this is production-safe.
14. Channel delivery can silently underperform when profiles do not yet have linked WhatsApp, Telegram, or email identifiers, even though in-app notification creation succeeds.
15. Email delivery code is now present, but deployment credentials and live SMTP behavior have not yet been smoke-tested.
16. Dashboard shell build remains noisy in this environment because of the long-standing path-resolution/sandbox issue, which makes local production-build verification unreliable for frontend auth changes.

## Severity
- Critical: #1, #3
- High: #2, #4
- Medium: #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16

## Root Cause
- Deployment/env drift between code and hosted environments.
- Security/auth middleware not fully centralized on protected endpoints.
- Fast feature expansion before operational hardening pass.
- Local Windows/Codex shell process lifecycle makes detached preview unreliable.
- Frontend now exposes the full ecosystem direction faster than all backend workflow depth exists.
- Negotiation domain model is ahead of the commuter UX design, so the operator-side thread is stronger than the passenger-side bargaining loop.
- Windows/Codex sandbox path resolution can interfere with `vite build` even when the repo itself is intact.
- Long-running interrupted edits can leave partially patched import statements if verification is stopped before a build completes.
- Route-truth intelligence now has backend ingest, frontend visibility, and local review/audit/reward support, but live migration/deploy/browser QA are still required.
- Contact-channel linking is still uneven across profiles, so delivery fan-out quality is constrained by missing recipient metadata.
- SMTP/Meta WhatsApp integrations are env-driven and newly wired, but not yet proven in the deployed environment.
- Frontend auth improvements can be implemented correctly while this shell still fails on dashboard build path resolution, so browser/live checks matter more than local build results for final sign-off.

## Fix Status
- In progress:
  - Frontend/backend route alignment and core missing endpoints were addressed in recent commits.
  - Live-map and service-request dispatch paths were added.
  - Mission Control reduces the disconnected-frontend issue by surfacing live backend/map/payment/compliance status across roles.
  - UI-only/dead-feeling actions are being replaced with inline feedback, navigation to real desks, or honest planned/staged status.
  - Static preview helper added at `dashboard/scripts/static-preview.cjs`.
  - Operator negotiation flow now persists to `negotiations` and can lock accepted fares onto the booking record.
  - July 3 frontend build passed after repairing interrupted import lines in access/onboarding files.
  - Admin compliance queue now calls the backend compliance status helper for Verify/Follow up/Reject actions.
- Pending:
  - Full JWT+RBAC middleware coverage.
  - Production OTP provider integration.
  - Idempotency keys for payment/booking critical writes.
  - Deployment parity audit and smoke-test checklist.
  - Centralize frontend system status polling/caching if repeated calls become noisy.
  - Complete the commuter-side negotiation lifecycle and verify Supabase auth/RLS behavior for production inserts.
  - Apply and verify the `map_signal_reviews` migration on live Supabase, then smoke-test admin route-truth Queue/Validate/Dismiss/Publish actions.
  - Backfill contact-channel linkage strategy for profiles (`phone`, `telegram_id`, WhatsApp-capable number, and eventual email field).
  - Live-test SMTP and Meta WhatsApp delivery after env setup and secret rotation.
