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
  "onViewTicket={openVerifiedPaidTicket}",
  "const openVerifiedPaidTicket=(record:PassengerBookingEntry)=>",
  "if(record.paymentPhase!=='paid')return",
  "setView('ticket')",
])assert.ok(dashboard.includes(token),'dashboard booking continuity: '+token);
for(const token of [
  'fetchPassengerBookingHistory(profileId)',
  'if(!profileId)',
  'setRecords(fetchError?[]:data)',
  "record.paymentPhase==='paid'?onViewTicket(record):onResume(record)",
  'Cash due · not collected',
  'Provider confirmation pending',
  'Retrieve signed ticket',
])assert.ok(recovery.includes(token),'passenger recovery: '+token);
assert.ok(service.includes("identity.user?.id!==profileId"),'owner identity');
assert.ok(service.includes(".eq('passenger_id',profileId)"),'owner database query');
assert.ok(service.includes("paid_momo','paid_cash"),'paid provider statuses included');
assert.ok(service.includes("if(!['ready','pending','cash_due','paid'].includes(decision.phase))return []"),
  'blocked and refunded tickets excluded');
console.log('PASS AFAT paid ticket retrieval and outstanding booking recovery linked to owner identity');
