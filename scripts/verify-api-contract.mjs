import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = {
  index: readFileSync(join(root, 'src', 'index.ts'), 'utf8'),
  routes: readFileSync(join(root, 'src', 'api', 'routes.ts'), 'utf8'),
  onboarding: readFileSync(join(root, 'src', 'api', 'onboarding.ts'), 'utf8'),
  frontend: readFileSync(join(root, 'dashboard', 'src', 'supabaseClient.ts'), 'utf8'),
  app: readFileSync(join(root, 'dashboard', 'src', 'App.tsx'), 'utf8'),
  registration: readFileSync(join(root, 'dashboard', 'src', 'components', 'shared', 'RegistrationHub.tsx'), 'utf8'),
  releaseSecurity: readFileSync(join(root, 'db', '20260825_release_security_clearance.sql'), 'utf8'),
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
  ['auth: general staff bootstrap defaults to operator and planner only', files.routes, "AFAT_BOOTSTRAP_ALLOW_ROLES || 'operator,planner'"],
  ['auth: general staff code can never grant admin', files.routes, "requestedRole !== 'admin' && (hasPhoneIdentity"],
  ['auth: QA bypass', files.routes, "router.post('/auth/qa-bypass'"],
  ['auth: send OTP', files.routes, "router.post('/auth/send-otp'"],
  ['auth: verify OTP', files.routes, "router.post('/auth/verify-otp'"],
  ['onboarding: passenger register', files.onboarding, "router.post('/passenger/register'"],
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
  ['dispatch: frontend sends access token', activeDispatchClient, 'headers: afatAuthHeaders()'],
  ['frontend probes contract health', files.frontend, '/health/contract'],
  ['frontend calls Supabase profile API', files.frontend, '/api/auth/supabase-profile'],
  ['frontend exposes staff approval code to operator and planner', files.app, "roleIntent === 'operator' || roleIntent === 'planner'"],
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
];

const failures = checks.filter(([, content, needle]) => !content.includes(needle));
const forbiddenChecks = [
  ['commuter lane cannot silently downgrade existing staff', files.routes, 'publicRoles.has(finalRole) || generalBootstrapAllowed'],
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
