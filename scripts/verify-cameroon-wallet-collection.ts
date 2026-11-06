import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCameroonWalletPhone,validCameroonCollectionNetwork} from '../src/services/cameroonWalletPhone';

for(const input of ['677 123 456','677123456','237677123456','+237 677 123 456','00237677123456','677-123-456'])
 assert.equal(normalizeCameroonWalletPhone(input),'237677123456','normalize Cameroon mobile wallet');
for(const input of [null,undefined,677123456,'','12345678','67712345','6771234567',
 '237237677123456','+234677123456','69912345x','777123456','00234677123456'])
 assert.equal(normalizeCameroonWalletPhone(input),null,'invalid wallet number must not initiate a collection');
assert.equal(validCameroonCollectionNetwork('mtn_momo'),true);
assert.equal(validCameroonCollectionNetwork('orange_money'),true);
assert.equal(validCameroonCollectionNetwork('unknown'),false);
assert.equal(validCameroonCollectionNetwork('pawapay'),false);

const api=readFileSync('src/api/routes.ts','utf8');
const paymentStart=api.indexOf("router.post('/payment/checkout'");
const paymentEnd=api.indexOf("router.get('/payment/provider-readiness'",paymentStart);
assert.ok(paymentStart>=0&&paymentEnd>paymentStart);
const checkout=api.slice(paymentStart,paymentEnd);
const validated=checkout.indexOf('const walletPhone=normalizeCameroonWalletPhone(phone)');
const reserved=checkout.indexOf(".update({\n        transaction_id: transactionId");
assert.ok(validated>=0&&reserved>validated,'validation must run before any money reservation');
assert.ok(checkout.includes('validCameroonCollectionNetwork(mobile_network)'));
assert.ok(checkout.includes('collection_initiated:false'));
assert.ok(checkout.includes('walletPhone,\n      parsedAmount'));
assert.ok(!checkout.includes('from ${phone}'),'no payer number printed by API');

const ui=readFileSync('dashboard/src/components/commuter/PaymentSheet.tsx','utf8');
assert.ok(ui.includes('const validLocalWalletNumber=/^6\\d{8}$/'));
assert.ok(ui.includes("selectedMethod!=='cash'&&!validLocalWalletNumber"));
assert.ok(ui.includes("(selectedMethod !== 'cash' && !validLocalWalletNumber)"));

const provider=readFileSync('src/services/payment.ts','utf8');
assert.ok(provider.includes('phone redacted'));
assert.ok(provider.includes('destination redacted'));
assert.ok(!provider.includes('XAF from ${formattedPhone}'));
assert.ok(!provider.includes('XAF to ${formattedPhone}'));
console.log('PASS Cameroon wallet normalization, network gating, no premature payment reserve, privacy');
