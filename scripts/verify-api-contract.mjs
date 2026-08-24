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
