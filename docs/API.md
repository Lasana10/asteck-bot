# AFAT API Memory

## Base
- Backend mounts APIs under `/api`.
- Health endpoints:
  - `GET /health`
  - `GET /api/health`

## Main Endpoint Groups
- Auth: `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`
- Identity and access:
  - `GET /api/access/me`
  - `POST /api/access/founder/bootstrap`
  - `PUT /api/access/founder/pass`
  - `POST /api/access/founder/pass/verify`
  - `POST /api/access/staff/invitations`
  - `POST /api/access/staff/invitations/accept`
- Reporting/Safety:
  - `POST /api/report`
  - `POST /api/sos/panic`
  - `GET /api/incidents`
  - `POST /api/broadcast`
  - `POST /api/intelligence/voice-report`
- Payments/Wallet:
  - `POST /api/payment/checkout`
  - `POST /api/payment/finalize`
  - `GET /api/payment/provider-readiness`
  - `POST /api/webhook/pawapay`
  - `POST /api/wallet/withdraw`
- Booking/Ticket:
  - `POST /api/booking/seat-hold`
  - `POST /api/booking/seat-hold/release`
  - `POST /api/booking/create-from-hold`
  - `POST /api/booking/complete`
  - `POST /api/ticket/issue`
  - `POST /api/ticket/verify-boarding`
- Guardian:
  - `POST /api/guardian/token`
  - `GET /api/guardian/watch/:token`
- Ops/Dispatch/Compliance:
  - `GET /api/ops/live-map`
  - `GET /api/ops/report-center`
  - `PATCH /api/ops/reports/:id/status`
  - `GET /api/ops/safety-score`
  - `GET /api/ops/demand-radar`
  - `GET /api/ops/compliance-radar`
  - `GET /api/dispatch/active`
  - `POST /api/dispatch/assign`
  - `POST /api/service/request`
  - `GET /api/compliance/summary/:profileId`
  - `PATCH /api/compliance/:id/status`
- AI:
  - `POST /api/ai/chat`
  - `POST /api/ai/vision`
  - `POST /api/ai/analyze`

## Frontend API Consumers Added
- `OperationsMissionControl` calls:
  - `GET /health`
  - `GET /api/ops/live-map?city=...`
  - `GET /api/payment/provider-readiness`
  - `GET /api/ops/compliance-radar` for planner/admin roles

## Request/Response Format
- JSON over HTTP.
- Success typically returns `{ success: true, ... }`.
- Error returns `{ error: string }` with status code (`400/404/409/500/502` patterns present).

## Authentication
- Access-foundation endpoints verify the Supabase bearer token server-side, derive trusted AAL from the verified JWT, and enforce permission/grant-ceiling rules.
- Planner/Admin public bootstrap is disabled unless the explicit legacy feature flag is enabled; the production value must remain `false`.
- Current boundary: older mutation endpoints are not yet consistently converted to the new permission helper. Full platform-wide RBAC conversion remains required.

## Webhooks
- `POST /api/webhook/pawapay` for payment status callbacks.
- `POST /api/whatsapp/webhook` for messaging bridge.

## Third-Party Integrations
- Supabase (DB + auth + realtime)
- PawaPay / Africa’s Talking (payments path)
- OpenRouter/Groq (AI path)
- Telegram/Twilio (messaging channels)
- Google/OSRM/Traccar (routing and fleet extensions)
