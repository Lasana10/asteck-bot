import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dashboard=readFileSync('dashboard/src/components/commuter/CommuterDashboard.tsx','utf8');
const recovery=readFileSync('dashboard/src/components/commuter/PassengerBookingRecovery.tsx','utf8');
const service=readFileSync('dashboard/src/services/paymentRecovery.ts','utf8');
for(const token of [
  "activeTab === 'bookings') setView('recover')",
  "if(view==='recover')return <PassengerBookingRecovery",
  "profileId={isGuest?null:profile?.id||null}",
  "const resumeExistingBooking=(record:RecoverablePaymentBooking)=>",
  "setCurrentBookingId(record.id)",
  "setCurrentSeatHoldId(null)",
  "setView('payment')",
  "onResume={resumeExistingBooking}",
  "setView('recover')",
])assert.ok(dashboard.includes(token),'dashboard account-booking continuity: '+token);
for(const token of [
  "fetchRecoverablePassengerPayments(profileId)",
  "if(!profileId)",
  "setRecords(fetchError?[]:data)",
  "onClick={()=>onResume(record)}",
  "Cash due · not collected",
  "Provider confirmation pending",
  "does not indicate that no paid tickets exist"
])assert.ok(recovery.includes(token),'passenger recovery truth: '+token);
assert.ok(service.includes("identity.user?.id!==profileId"),'owner identity check');
assert.ok(service.includes(".eq('passenger_id',profileId)"),'owner-filtered database query');
assert.ok(service.includes(".in('payment_status',['unpaid','failed','collection_pending','cash_due'])"),'no invented paid tickets');
console.log('PASS AFAT passenger bookings tab recovers only account-owned unpaid/pending/cash-due tickets');
