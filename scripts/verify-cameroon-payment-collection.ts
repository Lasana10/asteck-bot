import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCameroonCollectionReadiness} from '../src/services/paymentCollectionReadiness.ts';

const ready={
  provider:'pawapay',credentialsConfigured:true,environment:'production',
  signedWebhookConfigured:true,unsignedCallbacksAllowed:false,
  availability:{configured:true,environment:'production',cameroonAvailable:true},
};
assert.equal(evaluateCameroonCollectionReadiness(ready).collection_ready,true);
for(const changes of [
  {credentialsConfigured:false},{environment:'sandbox'},{provider:'africastalking'},
  {signedWebhookConfigured:false},{unsignedCallbacksAllowed:true},
  {availability:null},{availability:{configured:true,environment:'production',cameroonAvailable:false}},
  {availability:{configured:false,environment:'production',cameroonAvailable:true}},
  {availability:{configured:true,environment:'sandbox',cameroonAvailable:true}},
]) {
  const value=evaluateCameroonCollectionReadiness({...ready,...changes});
  assert.equal(value.collection_ready,false,JSON.stringify(changes));
  assert.ok(value.reasons.length);
}
const api=readFileSync('src/api/routes.ts','utf8');
const sheet=readFileSync('dashboard/src/components/commuter/PaymentSheet.tsx','utf8');
const checkout=api.slice(api.indexOf("router.post('/payment/checkout'"),api.indexOf("router.get('/payment/provider-readiness'"));
assert.ok(checkout.includes('cameroonPaymentAvailability()'));
assert.ok(checkout.includes('AFAT_CAMEROON_MOBILE_COLLECTION_UNAVAILABLE'));
assert.ok(checkout.indexOf('cameroonPaymentAvailability()')<checkout.indexOf('crypto.randomUUID()'),
 'Check real provider readiness before generating payment attempt or reserving booking');
assert.ok(api.includes('collection_ready: paymentReadiness.verdict.collection_ready'));
assert.ok(sheet.includes('mobileCollectionReady = providerReadiness?.collection_ready === true'));
assert.ok(sheet.includes("selectedMethod!=='cash'&&!mobileCollectionReady"));
assert.ok(sheet.includes('disabled={!mobileCollectionReady}'));
assert.ok(sheet.includes('Cash is a pay-later obligation'));
console.log('PASS Cameroon provider readiness blocks mobile collection without operator activation, keeps cash due distinct from paid');
