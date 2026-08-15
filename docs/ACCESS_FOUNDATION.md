# AFAT Identity and Access Foundation

## Delivery state

The foundation is implemented and verified in local commits. It has **not** been pushed, deployed, or applied to production Supabase.

Delivered layers:

- multi-role assignments separated from the legacy single `profiles.role` UI field
- role families, explicit permissions, scoped assignments, grant ceilings, and deny/allow overrides
- permanent one-time Founder bootstrap protected by confirmed email, server-held bootstrap-code hash, authenticator MFA (`aal2`), an atomic database function, and an audit event
- server-side salted Founder Pass with constant-time comparison, five-attempt lockout, and audit events
- progressive operator clearances D0–D3 and organization clearances O0–O5
- safe roles become active immediately; clearance limits regulated operations instead of blocking all participation
- invitation-only Planner/Admin/staff activation with email match, token hash, 72-hour expiry, MFA, organization/territory scope, and an atomic acceptance function
- private Founder/staff activation screens and an authorized Admin/Founder invitation panel
- append-only access audit events and explicit RLS/Data API grants
- safe new-user bootstrap that never trusts user-editable role metadata

## Authority model

Role assignment answers **who the person is in AFAT**. Clearance answers **which regulated services are currently available**. Scope answers **where or for which organization the authority applies**.

- Community reporting is available to every active identity.
- An operator applicant receives an active `operator_applicant` role and D0/D1/D2 clearance while trip acceptance and approved vehicle operation remain restricted.
- A company representative receives an active, organization-scoped role and O0 `active_limited` clearance so profile, roster, and training work can begin immediately.
- Planner/Admin roles are never created from a public role selector or `user_metadata`.
- Founder authority is established once and cannot be granted through staff invitation.

The legacy `profiles.role` field remains temporarily for existing dashboards. Protected access truth lives in `profile_role_assignments`, `access_role_permissions`, `access_scopes`, and `clearance_records`.

## Production deployment requirements

Do these in order. Stop if any verification fails.

1. Take a Supabase database backup or point-in-time recovery checkpoint.
2. Confirm all earlier AFAT migrations through `db/20260809_production_contract_repair.sql` are applied.
3. Review and apply `db/20260811_identity_access_foundation.sql` in a Supabase staging/branch database first.
4. Verify row counts, backfilled roles, clearance records, RLS policies, functions, and grants using the checks below.
5. Enable Supabase Email Auth and TOTP MFA. Allow redirects for:
   - `https://asteck-bot.pages.dev/founder/bootstrap`
   - `https://asteck-bot.pages.dev/staff/invite`
   - equivalent approved preview/staging URLs
6. Configure Render server secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` with service-role authority; never a browser publishable key
   - `AFAT_FOUNDER_BOOTSTRAP_EMAIL=<temporary-testing-founder-email>`
   - `AFAT_FOUNDER_BOOTSTRAP_TOKEN_HASH=<lowercase-sha256-hex>`
   - `AFAT_ENABLE_LEGACY_ROLE_BOOTSTRAP=false`
   - `FRONTEND_URL=https://asteck-bot.pages.dev`
7. Generate the one-time code locally, keep the raw value outside Git, and put only its SHA-256 digest in Render. Example:

   ```bash
   node -e "const c=require('node:crypto');const v=c.randomBytes(32).toString('base64url');console.log('RAW_ONCE='+v);console.log('SHA256='+c.createHash('sha256').update(v).digest('hex'))"
   ```

8. Deploy the Render backend first. Confirm `/health/contract` lists all `/api/access/*` routes and that an unauthenticated access request returns JSON `401`, not an HTML `404`.
9. Deploy Cloudflare Pages only after backend contract verification. Confirm the private activation paths render and target the intended Render API.
10. Sign up/confirm the configured Founder email, open `/founder/bootstrap`, enroll TOTP, enter the one-time code, and create the Founder Pass.
11. Confirm a second Founder bootstrap attempt is rejected.
12. From Admin Command, invite one low-privilege test staff identity, accept through the emailed link with MFA, verify only assigned role/scope, and then test expiry/replay rejection.

Changing `AFAT_FOUNDER_BOOTSTRAP_EMAIL` after bootstrap does not transfer Founder authority. The bootstrap is deliberately one-time. A future Founder transfer/recovery ceremony must be designed separately with dual control and audited recovery; do not edit the database manually.

## Pre-deployment checks

Run from the repository root:

```bash
npm ci
npm run build:backend
npm run test:api-contract
npm run test:access-foundation
cd dashboard
npm ci
npm run build
npm run lint
```

The migration should also be parsed/applied in a staging PostgreSQL/Supabase environment. Local static checks do not replace a staging migration run.

## Post-migration database checks

```sql
select role_family, count(*) from public.access_role_definitions group by role_family order by role_family;
select count(*) as permissions from public.access_permissions;
select status, count(*) from public.profile_role_assignments group by status order by status;
select track, level, status, count(*) from public.clearance_records group by track, level, status order by track, level;
select singleton, bootstrap_used, founder_profile_id, bootstrapped_at from public.founder_bootstrap_control;
select proname from pg_proc where proname in ('afat_has_permission', 'afat_bootstrap_founder', 'afat_accept_staff_invitation');
```

Do not select or export `founder_credentials`, invitation token hashes, service-role secrets, or raw bootstrap codes during routine QA.

## Known boundary after this foundation

The new access APIs enforce the new model. Existing legacy operational endpoints still require a systematic conversion from `profiles.role` checks to `afat_has_permission(...)` or `requireAccessPermission(...)`. Until that conversion and end-to-end staging tests are complete, this foundation must not be described as full platform-wide RBAC enforcement.
