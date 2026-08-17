# AFAT Architecture

## Frontend Architecture
- Stack: React 19 + Vite + TypeScript + Tailwind + React Leaflet.
- Location: `dashboard/`.
- Shared role shell layer: `dashboard/src/components/shared/OperationsMissionControl.tsx` reads live backend status, live-map feed, payment readiness, and compliance radar where relevant.
- Map direction: the frontend should render AFAT-controlled map intelligence layers derived from downloaded/open geodata, with live incident and fleet signals layered on top.
- Data access split:
  - Supabase direct reads/writes for many tables.
  - Backend API calls via `apiBaseUrl` (`/api/*`) for operational workflows.
- Real-time: Supabase channels for incidents, vehicles, bookings, notifications.
- PWA: `vite-plugin-pwa` enabled; service worker assets generated in build.

## Backend Architecture
- Stack: Node.js + Express + TypeScript.
- Location: `src/`.
- Entry point: `src/index.ts`.
- Key modules:
  - `src/api/routes.ts` (core API surface)
  - `src/api/onboarding.ts` (onboarding endpoints)
  - `src/services/*` (payments, AI router, queue jobs, telegram, etc.)
  - `src/infra/supabase.ts` (DB client + repositories)
- Security middleware currently includes:
  - CORS allow-list
  - request logging/sanitize/security headers
  - API rate limiter on `/api`

## Database Architecture
- Primary DB: Supabase Postgres.
- Access patterns:
  - Backend service key access (`SUPABASE_KEY`) in server runtime.
  - Frontend anon key access (`VITE_SUPABASE_ANON_KEY`) for client operations.
- Schema is migration-file driven from `db/*.sql`.
- Geospatial direction:
  - Supabase/Postgres should hold live operational records.
  - Downloaded/open base map data (for example OSM-derived extracts and prepared tiles/layers) should become AFAT's stable geospatial foundation.
  - Live signals should update against that foundation, not replace it.

## Infrastructure Diagram (Logical)
1. Cloudflare Pages serves `dashboard` PWA.
2. Render serves Express API and bot services.
3. Supabase stores operational data + auth + realtime.
4. Render Redis (Upstash/Render Redis pattern) supports queues/jobs where enabled.

## External APIs
- PawaPay / Africa’s Talking (payment rails readiness and fallback logic)
- OpenRouter (LLM routing)
- Groq (voice/AI integration path)
- OSM / OSRM / self-controlled routing and tile preparation are preferred over Google-dependent foundations
- Traccar integration path for fleet tracking
- Telegram + Twilio WhatsApp hooks

## AI Services
- Rule-based + external-model fallback architecture in backend (`AIRouter`, `/api/ai/*`).
- Voice report endpoint exists (`/api/intelligence/voice-report`) with mock/live branching by env key.
- Current production-grade offline/edge AI model integration is not yet complete end-to-end.
- Frontend AI guidance remains distributed across copilot, route intelligence, and driver HUD components; next architecture pass should consolidate AI context and avoid duplicative prompts.

## Deployment Architecture
- Backend deployment target: Render web service.
- Frontend deployment target: Cloudflare Pages.
- CI/CD path: GitHub push/merge triggers hosting redeploys.
- Runtime config dependency:
  - Frontend envs: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
  - Backend envs: `SUPABASE_URL`, `SUPABASE_KEY`, payment/provider keys, bot keys.
