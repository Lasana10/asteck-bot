# AFAT API Memory

## Base
- Backend mounts APIs under `/api`.
- Health endpoints:
  - `GET /health`
  - `GET /api/health`

## Main Endpoint Groups
- Auth:
  - `POST /api/auth/send-otp`
  - `POST /api/auth/verify-otp`
  - `POST /api/auth/refresh`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
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
  - `POST /api/ops/map-signal-reviews`
  - `PATCH /api/ops/map-signal-reviews/:movementLogId`
  - `POST /api/ops/notifications/send`
  - `GET /api/ops/report-center`
  - `PATCH /api/ops/reports/:id/status`
  - `GET /api/ops/safety-score`
  - `GET /api/ops/demand-radar`
  - `GET /api/ops/compliance-radar`
  - `POST /api/ops/checkpoints/enroll`
  - `GET /api/ops/checkpoints`
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
- Current state: AFAT now has backend-owned access tokens + refresh sessions.
- Role checks are now applied on several sensitive mutation routes including map-signal review, report status, compliance status, dispatch assignment, and ops notifications.
- Remaining work: complete centralized coverage across all high-value protected mutations.

## Webhooks
- `POST /api/webhook/pawapay` for payment status callbacks.
- `POST /api/whatsapp/webhook` for messaging bridge.

## Third-Party Integrations
- Supabase (DB + auth + realtime)
- PawaPay / Africa’s Talking (payments path)
- OpenRouter/Groq (AI path)
- Telegram bot + Meta WhatsApp Cloud API + SMTP email (messaging/notification channels)
- Google/OSRM/Traccar (routing and fleet extensions)
