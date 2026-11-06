import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync('src/api/routes.ts','utf8');
const start=api.indexOf("router.post('/wallet/withdraw'");
const end=api.indexOf('// ── SECURE TICKET ISSUE',start);
assert.ok(start>=0&&end>start,'legacy withdrawal endpoint must remain explicit and blocked');
const legacy=api.slice(start,end);
assert.ok(legacy.includes('res.status(410)'), 'legacy wallet path is permanently unavailable');
assert.ok(legacy.includes('LEGACY_WITHDRAWAL_DISABLED'));
assert.ok(legacy.includes('payout_executed:false'));
for(const mutation of ['appendWalletLedgerEntry(','.from(\'operator_wallets\')','.update(','.insert(','supabase.rpc('])
 assert.ok(!legacy.includes(mutation),'legacy endpoint must never mutate financial records: '+mutation);

const home=readFileSync('dashboard/src/components/operator/OperatorDashboard.tsx','utf8');
assert.ok(home.includes("requestOperatorPayout"),'old operator UI must use authenticated payout reservation');
assert.ok(!home.includes("requestOperatorWithdrawal"),'old wallet-withdraw client must no longer be reachable');
for(const token of [
 'if(withdrawBusy)return','Number.isSafeInteger(amount)',
 "destination.length<5", "withdrawProvider",
 "await requestOperatorPayout({",
 "data?.status!=='requested'", "Funds are reserved, not yet disbursed",
 "Payout outcome uncertain.", "disabled={withdrawBusy}",
 "Request payout · not yet paid",
])assert.ok(home.includes(token),'operator payout safety: '+token);

const rpc=readFileSync('dashboard/src/services/operatorExecutionClient.ts','utf8');
assert.ok(rpc.includes("supabase.rpc('afat_request_operator_payout'"),'payout goes through atomic wallet reservation');
assert.ok(rpc.includes("p_destination_ref:input.destinationRef"),'payment destination required');
console.log('PASS AFAT legacy non-atomic withdrawal disabled; operator payout uses authenticated atomic reservation');
