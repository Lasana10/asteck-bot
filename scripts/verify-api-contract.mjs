import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = {
  index: readFileSync(join(root, 'src', 'index.ts'), 'utf8'),
  routes: readFileSync(join(root, 'src', 'api', 'routes.ts'), 'utf8'),
  onboarding: readFileSync(join(root, 'src', 'api', 'onboarding.ts'), 'utf8'),
  frontend: readFileSync(join(root, 'dashboard', 'src', 'supabaseClient.ts'), 'utf8'),
  app: readFileSync(join(root, 'dashboard', 'src', 'App.tsx'), 'utf8'),
  roleAccess: readFileSync(join(root, 'dashboard', 'src', 'utils', 'roleAccess.ts'), 'utf8'),
  registration: readFileSync(join(root, 'dashboard', 'src', 'components', 'shared', 'RegistrationHub.tsx'), 'utf8'),
  publicPartnerMigration: readFileSync(join(root, 'supabase', 'migrations', '20260829193000_add_public_partner_workspace.sql'), 'utf8'),
  releaseSecurity: readFileSync(join(root, 'db', '20260825_release_security_clearance.sql'), 'utf8'),
  roleActivationMigration: readFileSync(join(root, 'supabase', 'migrations', '20260827152758_repair_profile_role_activation_contract.sql'), 'utf8'),
};

const activeDispatchRoute = files.routes.slice(
  files.routes.indexOf("router.get('/dispatch/active'"),
  files.routes.indexOf("router.get('/compliance/summary")
);
const activeDispatchClient = files.frontend.slice(
  files.frontend.indexOf('export async function fetchActiveDispatches()'),
  files.frontend.indexOf('export async function createDispatchAssignment')
);
const phoneOtpClient = files.frontend.slice(
  files.frontend.indexOf('export async function sendPhoneOtp'),
  files.frontend.indexOf('export async function refreshAfatSession')
);
const privilegedRoute = (start, end) => files.routes.slice(
  files.routes.indexOf(start),
  files.routes.indexOf(end)
);
const onboardingRoute = (start, end) => files.onboarding.slice(
  files.onboarding.indexOf(start),
  end ? files.onboarding.indexOf(end) : files.onboarding.length
);

const checks = [
  ['mounts core API under /api', files.index, "app.use('/api', apiRoutes)"],
  ['mounts onboarding API under /api/onboard', files.index, "app.use('/api/onboard', onboardingRoutes)"],
  ['returns JSON API 404', files.index, "app.use('/api', (req: Request, res: Response)"],
  ['exposes health contract', files.index, "app.get('/health/contract'"],
  ['auth: Supabase profile bootstrap', files.routes, "router.post('/auth/supabase-profile'"],
  ['auth: operator invitation is independently configured', files.routes, "'AFAT_OPERATOR_INVITE'"],
  ['auth: planner invitation is independently configured', files.routes, "'AFAT_PLANNER_INVITE'"],
  ['auth: admin bootstrap is independently configured', files.routes, "'AFAT_ADMIN_BOOTSTRAP'"],
  ['auth: controlled role accepts either authenticated email or phone identity', files.routes, 'return emailAllowed || phoneAllowed'],
  ['auth: controlled role codes use timing-safe comparison', files.routes, 'crypto.timingSafeEqual(expectedBytes, providedBytes)'],
  ['auth: existing approved staff can sign in without repeating the invite code', files.routes, 'existingRoleApproved || invitedRoleAllowed || adminBootstrapAllowed'],
  ['auth: operator application is explicit rather than created on sign-in', files.routes, 'Boolean(req.body?.startOperatorApplication)'],
  ['auth: controlled access errors identify configuration, code, or invited identity', files.routes, 'CONTROLLED_ACCESS_IDENTITY_DENIED'],
  ['auth: invalid operator invitation is rejected instead of opening an application', files.routes, "controlledRoleFailure('operator', identity, accessCode)"],
  ['auth: schema failures are not exposed to end users', files.routes, "code: schemaContractUnavailable ? 'ROLE_PROFILE_UNAVAILABLE'"],
  ['auth: suspended profiles are rejected centrally', files.routes, "res.status(403).json({ error: 'Access suspended' })"],
  ['auth: unapproved operators are rejected centrally', files.routes, "res.status(403).json({ error: 'Operator approval required' })"],
  ['auth: QA bypass', files.routes, "router.post('/auth/qa-bypass'"],
  ['auth: send OTP', files.routes, "router.post('/auth/send-otp'"],
  ['auth: verify OTP', files.routes, "router.post('/auth/verify-otp'"],
  ['onboarding: passenger register', files.onboarding, "router.post('/passenger/register'"],
  ['onboarding: public partner has a dedicated registration contract', files.onboarding, "router.post('/public-partner/register'"],
  ['onboarding: public partner explicitly preserves the profile platform role', files.onboarding, "role: existing.role || 'commuter'"],
  ['frontend: government registration uses public partner API', files.registration, 'registerPublicPartner'],
  ['frontend: government completion does not claim admin promotion', files.registration, 'This does not grant AFAT Planner or Admin authority.'],
  ['schema: public partner is modeled as an entity membership', files.publicPartnerMigration, 'create table if not exists public.public_partner_memberships'],
  ['schema: public partner permissions are scoped and privacy-safe', files.publicPartnerMigration, "aggregated_corridor_analytics"],
  ['public partner: mobility conditions use a dedicated membership-gated endpoint', files.routes, "router.get('/public-partner/mobility-conditions'"],
  ['public partner: mobility conditions explicitly exclude personal and financial data', files.routes, "excluded_fields: ['citizen_identity', 'reporter_identity', 'operator_identity', 'operator_financials', 'dispatch_assignments']"],
  ['public partner: responses use a dedicated membership-gated endpoint', files.routes, "router.post('/public-partner/responses'"],
  ['public partner: response identity derives from the authenticated profile', files.routes, 'requester_id: profile.id'],
  ['frontend: public partner response uses the dedicated API', files.frontend, '/api/public-partner/responses'],
  ['mobility map: passenger and operator use a sanitized authenticated feed', files.routes, "router.get('/mobility/map-feed'"],
  ['mobility map: sanitized feed excludes identities, plates, financials and dispatch assignments', files.routes, "excluded_fields: ['passenger_identity', 'reporter_identity', 'operator_identity', 'plate_number', 'operator_financials', 'dispatch_assignment']"],
  ['onboarding: driver register', files.onboarding, "router.post('/driver/register'"],
  ['onboarding: company register', files.onboarding, "router.post('/company/register'"],
  ['mobility: published departures', files.routes, "router.get('/mobility/departures'"],
  ['mobility: authenticated seat hold', files.routes, "router.post('/booking/seat-hold'"],
  ['mobility: booking from hold', files.routes, "router.post('/booking/create-from-hold'"],
  ['mobility: payment checkout', files.routes, "router.post('/payment/checkout'"],
  ['mobility: operator boarding', files.routes, "router.post('/ticket/verify-boarding'"],
  ['mobility: operator completion', files.routes, "router.post('/booking/complete'"],
  ['dispatch: active feed requires staff auth', activeDispatchRoute, "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['wallet: withdrawal requires operator auth', files.routes, "requireAuthRole(req, res, ['operator'])"],
  ['wallet: withdrawal derives operator from session', files.routes, 'const operator_id = session.profile.id'],
  ['admin: broadcast requires staff auth', privilegedRoute("router.post('/broadcast'", "router.post('/intelligence/voice-report'"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['admin: checkpoint enrollment requires staff auth', privilegedRoute("router.post('/ops/checkpoints/enroll'", "router.patch('/ops/operators"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['AI: chat requires authenticated profile', privilegedRoute("router.post('/ai/chat'", "router.post('/ai/vision'"), 'requireAuthRole(req, res)'],
  ['AI: vision requires authenticated profile', privilegedRoute("router.post('/ai/vision'", "router.post('/ai/analyze'"), 'requireAuthRole(req, res)'],
  ['admin: live map requires staff auth', privilegedRoute("router.get('/ops/live-map'", "router.get('/ops/report-center'"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['admin: report center requires staff auth', privilegedRoute("router.get('/ops/report-center'", "router.patch('/ops/reports"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['admin: demand radar requires staff auth', privilegedRoute("router.get('/ops/demand-radar'", "router.get('/ops/compliance-radar'"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['admin: compliance radar requires staff auth', privilegedRoute("router.get('/ops/compliance-radar'", "router.get('/dispatch/active'"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['compliance: summary verifies authenticated ownership', privilegedRoute("router.get('/compliance/summary", "router.patch('/compliance"), "access.profile.id !== profileId"],
  ['dispatch: assignment is staff-only', privilegedRoute("router.post('/dispatch/assign'", "router.post('/service/request'"), "requireAuthRole(req, res, ['admin', 'planner'])"],
  ['identity: shared backend session resolver is exported', files.routes, 'export async function getAuthProfileByToken'],
  ['registration: existing operator requires ownership', onboardingRoute("router.post('/driver/register'", "router.post('/vehicle/register'"), 'canResumeProfile(existing, authUser)'],
  ['registration: existing commuter requires ownership', onboardingRoute("router.post('/passenger/register'", "router.post('/company/register'"), 'canResumeProfile(existing, authUser)'],
  ['registration: existing fleet requires ownership', onboardingRoute("router.post('/company/register'", "router.post('/fare/post'"), 'canResumeProfile(existing, authUser)'],
  ['onboarding: vehicle registration requires role auth', onboardingRoute("router.post('/vehicle/register'", "router.post('/passenger/register'"), "requireAuthRole(req, res, ['operator', 'admin', 'planner'])"],
  ['fare: passenger identity derives from session', onboardingRoute("router.post('/fare/post'", "router.get('/fare/browse'"), 'const resolvedPassengerId = access.profile.id'],
  ['fare: response requires operator auth', onboardingRoute("router.post('/fare/respond'", "router.post('/fare/driver-post'"), "requireAuthRole(req, res, ['operator'])"],
  ['fare: driver offer derives identity from session', onboardingRoute("router.post('/fare/driver-post'", "router.get('/fare/market-stats'"), 'const resolvedDriverId = access.profile.id'],
  ['driver: fatigue enforces self or staff', onboardingRoute("router.get('/driver/fatigue", "router.post('/driver/log-time'"), "access.profile.id !== driver_id"],
  ['driver: time logging requires role auth', onboardingRoute("router.post('/driver/log-time'", "router.get('/driver/contract"), "requireAuthRole(req, res, ['operator', 'admin', 'planner'])"],
  ['driver: contract enforces self or staff', onboardingRoute("router.get('/driver/contract", ''), "access.profile.id !== driver_id"],
  ['dispatch: frontend sends user-bound auth token', activeDispatchClient, 'const authHeaders = await authenticatedApiHeaders()'],
  ['frontend probes contract health', files.frontend, '/health/contract'],
  ['frontend calls Supabase profile API', files.frontend, '/api/auth/supabase-profile'],
  ['frontend keeps access codes through auth events and reloads', files.frontend, "sessionStorage.getItem(pendingAccessCodeStorageKey)"],
  ['frontend exposes staff approval code to operator and planner', files.app, "roleIntent === 'operator' || roleIntent === 'planner'"],
  ['frontend provides controlled-role activation recovery', files.app, 'activateControlledRole'],
  ['frontend hides workspace navigation while controlled access is pending', files.app, '!controlledAccessPending && <BottomNav'],
  ['frontend converts schema errors into a safe recovery message', files.app, "lower.includes('schema cache')"],
  ['frontend does not lock approved operators as pending applications', files.roleAccess, "!['NOT_APPLIED', 'APPROVED'].includes(status)"],
  ['frontend exchanges PKCE callbacks exactly once', files.frontend, 'detectSessionInUrl: false'],
  ['frontend does not require an already approved staff member to re-enter a code', files.app, 'const requiresApprovalCode = false'],
  ['frontend keeps onboarding completion separate per authorized role', files.app, '`onboarded_${sessionUser.id}_${normalizeAfatRole(userProfile?.role)}`'],
  ['phone auth sends OTP through Supabase identity', phoneOtpClient, 'supabase.auth.signInWithOtp'],
  ['phone auth sends captcha token', phoneOtpClient, 'captchaToken: options?.captchaToken'],
  ['phone auth verifies SMS through Supabase identity', phoneOtpClient, 'supabase.auth.verifyOtp'],
  ['phone auth creates a Supabase session before AFAT profile bootstrap', phoneOtpClient, 'verified.session?.access_token'],
  ['phone auth bootstraps AFAT profile after verification', phoneOtpClient, 'ensureSupabaseEmailProfile(options)'],
  ['phone auth is deployment-gated until an SMS provider exists', files.app, "VITE_ENABLE_PHONE_AUTH === 'true'"],
  ['disabled phone auth is absent from the channel selector', files.app, "...(phoneAuthEnabled ? [{ channel: 'phone', label: 'Phone OTP' }] : [])"],
  ['signed-out registration requires an authenticated identity', files.registration, "track !== 'select' && !hasAuthenticatedSession"],
  ['registration explains that phone remains a contact until reliable sign-in is ready', files.registration, 'Phone sign-in will appear only when it is ready for reliable use.'],
  ['legacy Telegram users are removed from browser privileges', files.releaseSecurity, 'revoke all privileges on table public.users from anon, authenticated'],
  ['managed PostGIS objects are excluded from the app migration', files.releaseSecurity, "permission-managed by\n-- Supabase's PostGIS extension"],
  ['frontend calls passenger onboarding API', files.frontend, '/api/onboard/passenger/register'],
  ['frontend calls driver onboarding API', files.frontend, '/api/onboard/driver/register'],
  ['frontend calls company onboarding API', files.frontend, '/api/onboard/company/register'],
  ['schema: role activation access level exists', files.roleActivationMigration, 'add column if not exists access_level'],
  ['schema: role activation approval lifecycle exists', files.roleActivationMigration, 'add column if not exists approval_status'],
  ['schema: authority trigger protects activation fields', files.roleActivationMigration, 'new.access_level := old.access_level'],
  ['schema: PostgREST cache reload follows role contract migration', files.roleActivationMigration, "notify pgrst, 'reload schema'"],
];

const failures = checks.filter(([, content, needle]) => !content.includes(needle));
const forbiddenChecks = [
  ['commuter lane cannot silently downgrade existing staff', files.routes, 'publicRoles.has(finalRole) || generalBootstrapAllowed'],
  ['company approval cannot grant global planner', files.routes, 'grant_planner_access'],
  ['operator and planner cannot share a legacy bootstrap allowlist', files.routes, 'AFAT_BOOTSTRAP_ALLOW_EMAILS'],
  ['planner does not fall back to company intake', files.app, "if (role === 'planner') return 'company'"],
  ['admin does not fall back to government intake', files.app, "if (role === 'admin') return 'gov_link'"],
  ['restricted staff screen does not offer organization intake', files.app, 'Complete organization intake'],
  ['phone auth bypasses legacy AFAT OTP routes', phoneOtpClient, "/api/auth/send-otp"],
  ['phone auth bypasses legacy AFAT OTP verification', phoneOtpClient, "/api/auth/verify-otp"],
];
const forbiddenFailures = forbiddenChecks.filter(([, content, needle]) => content.includes(needle));

if (failures.length || forbiddenFailures.length) {
  console.error('AFAT API contract check failed:');
  for (const [label, , needle] of failures) {
    console.error(`- ${label}: missing ${needle}`);
  }
  for (const [label, , needle] of forbiddenFailures) {
    console.error(`- ${label}: forbidden ${needle}`);
  }
  process.exit(1);
}

console.log(`AFAT API contract check passed (${checks.length + forbiddenChecks.length} checks).`);
