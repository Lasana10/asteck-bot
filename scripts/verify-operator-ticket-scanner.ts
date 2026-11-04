import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSignedQrContent} from '../dashboard/src/services/signedTicketScan.ts';
const good={t:'a'.repeat(70),s:'b'.repeat(64)};
assert.deepEqual(parseSignedQrContent(JSON.stringify(good)),good);
for(const input of [
 '', 'A1234','not json','{"t":"x","s":"hello"}',
 JSON.stringify({...good,s:'not a signature'}),
 JSON.stringify({...good,t:'x'.repeat(5000)}),
 JSON.stringify({...good,s:'g'.repeat(64)}),
 JSON.stringify([good]),
]){
 assert.equal(parseSignedQrContent(input),null,'no local trust in unsigned or malformed QR');
}
const scanner=readFileSync('dashboard/src/components/operator/OperatorTicketScanner.tsx','utf8');
const ui=readFileSync('dashboard/src/components/operator/OperatorBoardingManifest.tsx','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
for(const token of [
 'getUserMedia',
 'facingMode',
 "formats:['qr_code']",
 'cameraRef.current?.getTracks().forEach(track=>track.stop())',
 'parseSignedQrContent(code.rawValue)',
 'verifyBoardingToken(ticket',
 'if(!navigator.onLine)',
 'data?.success!==true',
 'onVerified()',
 'only AFAT',
])assert.ok(scanner.includes(token),'operator signed camera checkout: '+token);
assert.ok(ui.includes('<OperatorTicketScanner onVerified={()=>setRefreshKey(key=>key+1)}/>'));
const boarding=api.slice(api.indexOf("router.post('/ticket/verify-boarding'"),api.indexOf('// ── TRIP COMPLETION',api.indexOf("router.post('/ticket/verify-boarding'")));
for(const token of [
 "requireAuthRole(req, res, ['operator'])",
 "signTicketPayload(ticket.t)",
 "decoded.oid !== operator_id",
 "isBoardablePaymentStatus(booking.payment_status)",
 "supabase.rpc('afat_board_booking'",
])assert.ok(boarding.includes(token),'server identity and signed boarding authority: '+token);
assert.ok(!scanner.includes(".from('bookings').update("));
console.log('PASS AFAT camera/manual QR reading never bypasses authenticated signed-ticket boarding');
