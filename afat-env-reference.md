# AFAT Environment Reference

## Backend

Required:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `SESSION_SECRET`
- `PAYMENT_API_KEY`
- `REDIS_URL`

Strongly recommended:

- `FRONTEND_URL=https://asteck-bot.pages.dev`
- `TICKET_SIGNING_SECRET=<strong-random-secret>`
- `PAYMENT_PROVIDER=pawapay`
- `NODE_ENV=production`
- `PORT=3000`

Controlled staff onboarding (backend only; never expose these as `VITE_*` values):

- `AFAT_BOOTSTRAP_ALLOW_EMAILS=<comma-separated approved operator/planner emails>`
- `AFAT_BOOTSTRAP_ACCESS_CODE=<rotatable operator/planner approval code>`
- `AFAT_BOOTSTRAP_ALLOW_ROLES=operator,planner`
- `AFAT_ADMIN_BOOTSTRAP_EMAILS=<comma-separated approved administrator emails>`
- `AFAT_ADMIN_BOOTSTRAP_CODE=<separate rotatable administrator approval code>`

The general staff code cannot grant administrator access. Changing a code blocks future grants but does not revoke an already granted role; suspend the staff profile and revoke its sessions for offboarding.

Optional / feature-specific:

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
