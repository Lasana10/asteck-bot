# AFAT Bugs Memory

## Open Bugs
1. Frontend can fall back to placeholder Supabase URL when env vars are missing.
2. OTP flow is mock-based (`123456`) and not production-auth secure.
3. Auth/RBAC is not consistently enforced on all mutating API routes.
4. Payment flow lacks strong idempotency guarantees for retries.
5. Data emptiness in some ops cards can make platform appear inactive without seed/live telemetry.
6. Service worker/offline behavior needs deployment-level verification for all promised map modes.
7. Mission Control currently depends on client-side endpoint polling and does not yet share a central cached status store.

## Severity
- Critical: #1, #3
- High: #2, #4
- Medium: #5, #6, #7

## Root Cause
- Deployment/env drift between code and hosted environments.
- Security/auth middleware not fully centralized on protected endpoints.
- Fast feature expansion before operational hardening pass.

## Fix Status
- In progress:
  - Frontend/backend route alignment and core missing endpoints were addressed in recent commits.
  - Live-map and service-request dispatch paths were added.
  - Mission Control reduces the disconnected-frontend issue by surfacing live backend/map/payment/compliance status across roles.
- Pending:
  - Full JWT+RBAC middleware coverage.
  - Production OTP provider integration.
  - Idempotency keys for payment/booking critical writes.
  - Deployment parity audit and smoke-test checklist.
  - Centralize frontend system status polling/caching if repeated calls become noisy.
