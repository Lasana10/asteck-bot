# AFAT Environment Reference

## Backend

Required:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TELEGRAM_BOT_TOKEN`
- `SESSION_SECRET`
- `AFAT_FOUNDER_BOOTSTRAP_EMAIL`
- `AFAT_FOUNDER_BOOTSTRAP_TOKEN_HASH`
- `PAYMENT_API_KEY`
- `REDIS_URL`

Strongly recommended:

- `FRONTEND_URL=https://asteck-bot.pages.dev`
- `TICKET_SIGNING_SECRET=<strong-random-secret>`
- `PAYMENT_PROVIDER=pawapay`
- `NODE_ENV=production`
- `PORT=3000`
- `AFAT_ENABLE_LEGACY_ROLE_BOOTSTRAP=false`

Optional / feature-specific:

- `SUPABASE_KEY` (legacy backend fallback only; access-foundation APIs require `SUPABASE_SECRET_KEY`)
- `WEBHOOK_DOMAIN`
- `ADMIN_IDS`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `OPENWEATHERMAP_API_KEY`
- `ARKESEL_API_KEY`
- `ARKESEL_SENDER_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`
- `OLLAMA_URL`

## Frontend

Required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=https://asteck-bot.onrender.com`
- `VITE_TURNSTILE_SITE_KEY`

Optional:

- `VITE_GROQ_API_KEY`
- `VITE_GEMINI_API_KEY`

## Production Notes

- `FRONTEND_URL` is used for guardian watch links
- `TICKET_SIGNING_SECRET` is used for secure ticket signatures
- if `TICKET_SIGNING_SECRET` is missing, the backend falls back to a less desirable secret source
- `VITE_API_URL` must point to the real backend for ticket issue, onboarding, and withdrawal flows
- `AFAT_FOUNDER_BOOTSTRAP_EMAIL` is the temporary, confirmed email permitted to perform the one-time Founder bootstrap; set it in Render, never in the frontend bundle
- for the current controlled test, set `AFAT_FOUNDER_BOOTSTRAP_EMAIL` to the Founder testing email supplied by the owner; replace it through deployment configuration when the permanent AFAT domain identity is ready
- `AFAT_FOUNDER_BOOTSTRAP_TOKEN_HASH` is the lowercase SHA-256 hex digest of a one-time random bootstrap code; never store the raw code in Git or frontend variables
- Founder bootstrap requires a confirmed Supabase email and an `aal2` authenticator session, succeeds once, and then disables itself in the database
- `AFAT_ENABLE_LEGACY_ROLE_BOOTSTRAP` must remain `false`; Planner and Admin access is invitation-only after the access-foundation migration
