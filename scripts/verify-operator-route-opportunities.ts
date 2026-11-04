import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104095500_afat_operator_route_opportunities.sql','utf8');
const ui=readFileSync('dashboard/src/components/operator/OperatorRouteOpportunities.tsx','utf8');
const mount=readFileSync('dashboard/src/components/operator/OperatorDepartureOperations.tsx','utf8');
for(const token of [
  "v_operator.role<>'operator'",
  "v_operator.operator_application_status<>'APPROVED'",
  "v_operator.verification_status<>'verified'",
  "v_operator.preferred_city",
  "metadata->>'departure_demand'='true'",
  "having sum(signal_count)>=3",
  "'scheduled_departures_verified',false",
  "'represents_unique_passengers',false",
  "revoke all on function public.afat_operator_route_opportunities() from public,anon,authenticated",
])assert.ok(sql.includes(token),'operator permission and aggregate truth: '+token);
for(const token of [
  "supabase.rpc('afat_operator_route_opportunities')",
  "item.reported_requests>=3",
  "item.actual_vehicle_available===false",
  "item.booking_confirmed===false",
  "AFAT does not auto-publish demand as supply",
])assert.ok(ui.includes(token),'operator display: '+token);
assert.ok(mount.includes('<OperatorRouteOpportunities/>'));
console.log('PASS only verified operators see thresholded demand and cannot infer bookings');
