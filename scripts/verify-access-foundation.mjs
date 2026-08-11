import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const files = {
  migration: read('db', '20260811_identity_access_foundation.sql'),
  service: read('src', 'services', 'AccessControlService.ts'),
  accessApi: read('src', 'api', 'access.ts'),
  profileApi: read('src', 'api', 'routes.ts'),
  onboarding: read('src', 'api', 'onboarding.ts'),
  index: read('src', 'index.ts'),
  render: read('render.yaml'),
};

function sourceTree(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceTree(path);
    return /\.(?:ts|tsx|js|jsx|html)$/.test(entry) ? [readFileSync(path, 'utf8')] : [];
  }).join('\n');
}

const dashboardSource = sourceTree(join(root, 'dashboard', 'src'));
const required = [
  ['multi-role assignments', files.migration, 'create table if not exists public.profile_role_assignments'],
  ['role permission matrix', files.migration, 'create table if not exists public.access_role_permissions'],
  ['scoped roles', files.migration, 'create table if not exists public.access_scopes'],
  ['progressive clearance', files.migration, 'create table if not exists public.clearance_records'],
  ['staff invitations', files.migration, 'create table if not exists public.staff_invitations'],
  ['append-only audit', files.migration, 'AFAT access audit events are append-only'],
  ['one-time Founder state', files.migration, 'bootstrap_used boolean not null default false'],
  ['atomic Founder bootstrap', files.migration, 'create or replace function public.afat_bootstrap_founder'],
  ['atomic invitation acceptance', files.migration, 'create or replace function public.afat_accept_staff_invitation'],
  ['new-user safe default', files.migration, "values (new.id, 'commuter', 'active', 'automatic'"],
  ['explicit authenticated grants', files.migration, 'grant select on public.profile_role_assignments to authenticated'],
  ['sensitive invitation revoke', files.migration, 'revoke all on public.staff_invitations from public, anon, authenticated'],
  ['service-only Founder RPC', files.migration, 'grant execute on function public.afat_bootstrap_founder(uuid, text, jsonb) to service_role'],
  ['verified Supabase identity', files.service, 'supabase.auth.getUser(token)'],
  ['trusted AAL2 claim', files.service, "claims.aal === 'aal2'"],
  ['constant-time bootstrap check', files.service, 'crypto.timingSafeEqual'],
  ['Founder Pass rate lock', files.service, 'failedAttempts >= 5'],
  ['hashed invitation token', files.service, 'const tokenHash = sha256(rawToken)'],
  ['staff email delivery', files.service, 'supabase.auth.admin.inviteUserByEmail'],
  ['grant ceiling', files.service, 'The requested role exceeds your grant ceiling.'],
  ['organization scope requirement', files.service, 'Organization staff invitations require an organization scope.'],
  ['invitation AAL2', files.service, 'Staff activation requires authenticator MFA (AAL2).'],
  ['Founder bootstrap route', files.accessApi, "router.post('/access/founder/bootstrap'"],
  ['staff invite route', files.accessApi, "router.post('/access/staff/invitations'"],
  ['access router mounted', files.index, "app.use('/api', accessRoutes)"],
  ['legacy role bootstrap off', files.profileApi, "AFAT_ENABLE_LEGACY_ROLE_BOOTSTRAP === 'true'"],
  ['staff roles invitation-only', files.profileApi, 'Planner and Admin access is invitation-only'],
  ['operator role active immediately', files.onboarding, "roleKey = isApproved ? 'verified_operator' : 'operator_applicant'"],
  ['operator clearance limits operations', files.onboarding, "restricted: isApproved ? [] : ['trip.accept', 'vehicle.operate']"],
  ['organization O0 active-limited', files.onboarding, "clearance_level: 'O0'"],
  ['Founder env is server-only', files.render, 'AFAT_FOUNDER_BOOTSTRAP_EMAIL'],
];

const forbidden = [
  ['frontend must not contain testing Founder email', dashboardSource, 'asanadaniel8@gmail.com'],
  ['frontend must not contain service key name', dashboardSource, 'SUPABASE_SECRET_KEY'],
  ['profile bootstrap must not trust role metadata', files.profileApi, 'user.user_metadata?.role'],
  ['migration must not hard-code testing Founder email', files.migration, 'asanadaniel8@gmail.com'],
  ['backend must not store raw invitation token', files.service, 'invitation_token: rawToken'],
];

const missing = required.filter(([, content, needle]) => !content.includes(needle));
const unsafe = forbidden.filter(([, content, needle]) => content.includes(needle));

if (missing.length || unsafe.length) {
  console.error('AFAT access foundation check failed:');
  for (const [label, , needle] of missing) console.error(`- ${label}: missing ${needle}`);
  for (const [label, , needle] of unsafe) console.error(`- ${label}: forbidden ${needle}`);
  process.exit(1);
}

console.log(`AFAT access foundation check passed (${required.length} required, ${forbidden.length} security checks).`);
