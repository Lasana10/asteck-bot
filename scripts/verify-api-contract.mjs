import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = {
  index: readFileSync(join(root, 'src', 'index.ts'), 'utf8'),
  routes: readFileSync(join(root, 'src', 'api', 'routes.ts'), 'utf8'),
  onboarding: readFileSync(join(root, 'src', 'api', 'onboarding.ts'), 'utf8'),
  frontend: readFileSync(join(root, 'dashboard', 'src', 'supabaseClient.ts'), 'utf8'),
};

const activeDispatchRoute = files.routes.slice(
  files.routes.indexOf("router.get('/dispatch/active'"),
  files.routes.indexOf("router.get('/compliance/summary")
);
const activeDispatchClient = files.frontend.slice(
  files.frontend.indexOf('export async function fetchActiveDispatches()'),
  files.frontend.indexOf('export async function createDispatchAssignment')
);
const privilegedRoute = (start, end) => files.routes.slice(
  files.routes.indexOf(start),
  files.routes.indexOf(end)
);

const checks = [
  ['mounts core API under /api', files.index, "app.use('/api', apiRoutes)"],
  ['mounts onboarding API under /api/onboard', files.index, "app.use('/api/onboard', onboardingRoutes)"],
  ['returns JSON API 404', files.index, "app.use('/api', (req: Request, res: Response)"],
  ['exposes health contract', files.index, "app.get('/health/contract'"],
  ['auth: Supabase profile bootstrap', files.routes, "router.post('/auth/supabase-profile'"],
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
  ['dispatch: frontend sends access token', activeDispatchClient, 'headers: afatAuthHeaders()'],
  ['frontend probes contract health', files.frontend, '/health/contract'],
  ['frontend calls Supabase profile API', files.frontend, '/api/auth/supabase-profile'],
  ['frontend calls passenger onboarding API', files.frontend, '/api/onboard/passenger/register'],
  ['frontend calls driver onboarding API', files.frontend, '/api/onboard/driver/register'],
  ['frontend calls company onboarding API', files.frontend, '/api/onboard/company/register'],
];

const failures = checks.filter(([, content, needle]) => !content.includes(needle));

if (failures.length) {
  console.error('AFAT API contract check failed:');
  for (const [label, , needle] of failures) {
    console.error(`- ${label}: missing ${needle}`);
  }
  process.exit(1);
}

console.log(`AFAT API contract check passed (${checks.length} checks).`);
