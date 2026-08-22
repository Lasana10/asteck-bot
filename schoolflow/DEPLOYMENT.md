# DREEM Deployment

DREEM must be deployed as its own Cloudflare application, separate from AFAT/AsTeck.

## Cloudflare Pages

Create a dedicated Cloudflare Pages project:

- Project name: `dreem-school-os`
- Git repository: `Lasana10/asteck-bot`
- Production branch: `dreem/integration`
- Root directory: `schoolflow`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`

Required environment variables:

```text
VITE_SUPABASE_URL=https://vlukkucwtfmfgpzvjyvd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<rotated-supabase-publishable-key>
VITE_DREEM_DEMO_MODE=false
```

Do not use the root `wrangler.jsonc` for DREEM. The root config is currently named `asteck-bot` and publishes `dashboard/dist`, which belongs to the older AFAT/AsTeck surface.

## Supabase Edge Functions

Deploy `provision-access-user` and `update-access-status` from `supabase/functions`. Both require JWT verification. Supabase provides the project URL and built-in server keys inside the function runtime; add only:

```text
DREEM_APP_URL=<deployed DREEM application URL>
```

Never copy `SUPABASE_SERVICE_ROLE_KEY` into the Vite or Cloudflare frontend environment.

## Direct Wrangler Deploy

From this folder:

```powershell
cd C:\tmp\dreem-handoff\schoolflow
npm ci
npm run build
npx wrangler deploy
```

This uses `schoolflow/wrangler.jsonc`, whose Cloudflare worker/static-assets name is `dreem-school-os`.

## Render

Render is not the primary DREEM frontend host. Keep Render for backend compatibility services only when needed. The DREEM web app should live on Cloudflare under its own project identity.
