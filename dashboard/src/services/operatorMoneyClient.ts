import { supabase } from '../supabaseClient';

export type OperatorWalletSnapshot = {
  balanceXaf: number;
  reservedXaf: number;
  availableXaf: number;
  recentLedger: any[];
  payoutRequests: any[];
};

export async function fetchOperatorWalletSnapshot(profileId: string): Promise<OperatorWalletSnapshot> {
  const [walletResult, ledgerResult, payoutResult] = await Promise.all([
    supabase.from('operator_wallets').select('operator_id,balance_xaf,updated_at').eq('operator_id', profileId).maybeSingle(),
    supabase.from('wallet_ledger').select('id,booking_id,entry_type,direction,gross_amount,commission_amount,net_amount,status,reference,created_at,updated_at').eq('operator_id', profileId).order('created_at', { ascending: false }).limit(40),
    supabase.from('operator_payout_requests').select('id,amount_xaf,provider,destination_ref,status,external_id,failure_reason,requested_at,updated_at,completed_at').eq('operator_id', profileId).order('requested_at', { ascending: false }).limit(20),
  ]);

  if (walletResult.error) throw walletResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  if (payoutResult.error) throw payoutResult.error;

  const balanceXaf = Number(walletResult.data?.balance_xaf || 0);
  const recentLedger = ledgerResult.data || [];
  const reservedXaf = recentLedger
    .filter((entry: any) => entry.entry_type === 'withdrawal' && entry.direction === 'debit' && entry.status === 'requested')
    .reduce((sum: number, entry: any) => sum + Number(entry.net_amount || 0), 0);

  return {
    balanceXaf,
    reservedXaf,
    availableXaf: Math.max(0, balanceXaf - reservedXaf),
    recentLedger,
    payoutRequests: payoutResult.data || [],
  };
}

export async function requestOperatorPayout(input: { amountXaf: number; provider: string; destinationRef: string }) {
  const { data, error } = await supabase.rpc('afat_request_operator_payout', {
    p_amount_xaf: Math.round(input.amountXaf),
    p_provider: input.provider.trim(),
    p_destination_ref: input.destinationRef.trim(),
  });
  if (error) throw error;
  return data;
}
