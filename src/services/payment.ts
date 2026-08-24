import nodeCrypto from 'node:crypto';

/**
 * ============================================================================
 * PAYMENT SERVICE — FinTech / Mobile Money Gateway
 * ============================================================================
 * Handles Mobile Money payments (MTN MoMo, Orange Money) for:
 *   - Ride payments (passenger -> operator)
 *   - Service fees
 *   - Trust point cashouts (future)
 *
 * Currently a structured stub. Replace with your chosen provider SDK:
 *   - Campay (campay.net) — Popular for Cameroon
 *   - Flutterwave
 *   - Africa's Talking Payments
 *   - Direct MTN MoMo / Orange Money API
 * ============================================================================
 */

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message: string;
  provider?: string;
  rawStatus?: string;
}

export class PaymentService {
  private apiKey: string;
  private provider: string;
  private pawaPayBaseUrl: string;

  constructor() {
    this.apiKey = process.env.PAWAPAY_API_TOKEN || process.env.PAYMENT_API_KEY || '';
    this.provider = process.env.PAYMENT_PROVIDER || 'pawapay'; // pawapay | campay | africastalking
    const pawaPayEnv = (process.env.PAWAPAY_ENV || process.env.NODE_ENV || 'sandbox').toLowerCase();
    this.pawaPayBaseUrl =
      process.env.PAWAPAY_BASE_URL ||
      (pawaPayEnv === 'production' ? 'https://api.pawapay.io/v2' : 'https://api.sandbox.pawapay.io/v2');
  }

  private normalizeCameroonPhone(phone: string) {
    const digits = String(phone || '').replace(/[^\d]/g, '');
    if (digits.startsWith('237')) return digits;
    return `237${digits.replace(/^0+/, '')}`;
  }

  private inferCameroonProvider(phone: string, requested?: string) {
    const normalized = String(requested || '').toLowerCase();
    if (normalized.includes('orange')) return 'ORANGE_CMR';
    if (normalized.includes('mtn')) return 'MTN_MOMO_CMR';

    const local = this.normalizeCameroonPhone(phone).slice(3);
    return /^(67|650|651|652|653|654|68)/.test(local) ? 'MTN_MOMO_CMR' : 'ORANGE_CMR';
  }

  /**
   * Initiate a Mobile Money Push Payment (Deposit)
   * This sends a USSD push to the user's phone asking for their PIN.
   * @param provider 'africastalking' | 'pawapay'
   */
  async initiateMomoPayment(
    payerPhone: string,
    amount: number,
    recipientDescription: string,
    preferredProvider?: 'africastalking' | 'pawapay',
    requestedNetwork?: string,
    idempotencyKey?: string,
  ): Promise<PaymentResult> {
    const providerOrder: ('pawapay' | 'africastalking')[] = preferredProvider 
      ? [preferredProvider] 
      : (this.provider === 'pawapay' ? ['pawapay', 'africastalking'] : ['africastalking', 'pawapay']);

    let lastError = '';

    for (const providerToTry of providerOrder) {
      const result = await this.tryProviderPayment(providerToTry, payerPhone, amount, recipientDescription, requestedNetwork, idempotencyKey);
      if (result.success) return result;
      lastError = result.message;
      console.warn(`⚠️ [Payment] Provider ${providerToTry} failed, trying fallback...`);
    }

    return {
      success: false,
      message: `All payment providers failed. Last error: ${lastError}`,
    };
  }

  private async tryProviderPayment(
    provider: 'africastalking' | 'pawapay',
    payerPhone: string,
    amount: number,
    recipientDescription: string,
    requestedNetwork?: string,
    idempotencyKey?: string,
  ): Promise<PaymentResult> {
    const formattedPhone = this.normalizeCameroonPhone(payerPhone);
    const transactionId = idempotencyKey || nodeCrypto.randomUUID();
    
    console.log(`💰 [Payment] ${provider.toUpperCase()} Push: ${amount} XAF from ${formattedPhone}`);

    // ── PROVIDER: PawaPay (Elite/QR/Modern) ───────────────────────────────
    if (provider === 'pawapay' && this.apiKey) {
      try {
        const mobileProvider = this.inferCameroonProvider(formattedPhone, requestedNetwork);

        const response = await fetch(`${this.pawaPayBaseUrl}/deposits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            depositId: transactionId,
            amount: amount.toString(),
            currency: 'XAF',
            payer: {
              type: 'MMO',
              accountDetails: {
                phoneNumber: formattedPhone,
                provider: mobileProvider
              }
            },
            customerMessage: `AFAT ${recipientDescription}`.slice(0, 160)
          }),
        });

        const data = await response.json();
        if (response.ok && ['ACCEPTED', 'SUBMITTED', 'PENDING'].includes(String(data.status || '').toUpperCase())) {
          return {
            success: true,
            transactionId,
            provider: 'pawapay',
            rawStatus: data.status,
            message: `PawaPay collection initiated via ${mobileProvider}.`,
          };
        }

        return {
          success: false,
          provider: 'pawapay',
          rawStatus: data.status,
          message: data?.message || data?.errorMessage || `PawaPay deposit rejected with HTTP ${response.status}.`
        };
      } catch (err: any) {
        console.error('❌ [Payment] PawaPay Error:', err.message);
        return { success: false, provider: 'pawapay', message: err.message || 'PawaPay network error.' };
      }
    }

    // ── PROVIDER: Africa's Talking (USSD-Native/Legacy) ───────────────────
    if (provider === 'africastalking') {
      try {
        const AfricasTalking = require('africastalking');
        const at = AfricasTalking({
          apiKey: process.env.AT_API_KEY || '',
          username: process.env.AT_USERNAME || 'sandbox',
        });
        
        const result = await at.PAYMENTS.mobileCheckout({
          productName: 'AsTeck Ride Payment',
          phoneNumber: formattedPhone,
          currencyCode: 'XAF',
          amount: amount,
          metadata: { transactionId, description: recipientDescription }
        });

        return {
          success: result.status === 'PendingConfirmation',
          transactionId: result.transactionId || transactionId,
          message: result.description || 'AT Payment initiated.',
        };
      } catch (err: any) {
        console.error('❌ [Payment] AT Error:', err.message);
      }
    }

    // Never fabricate a successful financial transaction. A local-only
    // simulator can be enabled deliberately for automated development tests.
    if (process.env.NODE_ENV !== 'production' && process.env.AFAT_ENABLE_PAYMENT_SIMULATOR === 'true') {
      return {
        success: true,
        transactionId: `sim_${Date.now()}`,
        provider: 'simulator',
        rawStatus: 'SIMULATED_PENDING',
        message: `[SIMULATOR] ${amount} XAF collection initiated.`,
      };
    }

    return {
      success: false,
      provider,
      rawStatus: 'PROVIDER_NOT_CONFIGURED',
      message: 'No live mobile-money provider is configured.',
    };
  }

  /**
   * Initiate a Mobile Money B2C (Business to Customer) transfer.
   * Used for Operator Cash-Outs via PawaPay /payouts.
   */
  async initiateCashOut(
    recipientPhone: string,
    amount: number
  ): Promise<PaymentResult> {
    const formattedPhone = this.normalizeCameroonPhone(recipientPhone);
    const payoutId = nodeCrypto.randomUUID();
    const mobileProvider = this.inferCameroonProvider(formattedPhone);

    console.log(`🏦 [Cash-Out] PawaPay Payout: ${amount} XAF to ${formattedPhone} (${mobileProvider})`);

    if (this.provider === 'pawapay' && this.apiKey) {
      try {
        const response = await fetch(`${this.pawaPayBaseUrl}/payouts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payoutId,
            amount: amount.toString(),
            currency: 'XAF',
            recipient: {
              type: 'MMO',
              accountDetails: {
                phoneNumber: formattedPhone,
                provider: mobileProvider
              }
            },
            customerMessage: 'AFAT earnings withdrawal'
          }),
        });

        const data = await response.json();

        if (response.ok && (data.status === 'ACCEPTED' || data.status === 'SUBMITTED' || data.status === 'PENDING')) {
          return {
            success: true,
            transactionId: payoutId,
            provider: 'pawapay',
            rawStatus: data.status,
            message: `PawaPay payout initiated to ${formattedPhone}.`,
          };
        } else {
          return {
            success: false,
            message: data.errorMessage || data.message || 'PawaPay payout failed.'
          };
        }
      } catch (err: any) {
        console.error('❌ [Payment] PawaPay Error:', err.message);
        return { success: false, message: 'Network error calling PawaPay.' };
      }
    }

    if (this.provider === 'africastalking' && this.apiKey) {
      try {
        const AfricasTalking = require('africastalking');
        const at = AfricasTalking({
          apiKey: this.apiKey,
          username: process.env.AT_USERNAME || 'sandbox',
        });
        
        const result = await at.PAYMENTS.mobileB2C({
          productName: 'AsTeck Wallet Withdrawal',
          recipients: [{
            phoneNumber: formattedPhone,
            currencyCode: 'XAF',
            amount: amount,
            reason: 'Operator Earnings Withdrawal',
            metadata: { type: 'withdrawal' }
          }]
        });

        const entry = result.entries?.[0];
        return {
          success: entry?.status === 'Success',
          transactionId: entry?.transactionId,
          message: entry?.errorMessage || 'Withdrawal processed.',
        };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }

    if (process.env.NODE_ENV !== 'production' && process.env.AFAT_ENABLE_PAYMENT_SIMULATOR === 'true') {
      return {
        success: true,
        transactionId: `sim_b2c_${Date.now()}`,
        provider: 'simulator',
        rawStatus: 'SIMULATED_PENDING',
        message: `[SIMULATOR] ${amount} XAF cash-out initiated.`,
      };
    }

    return {
      success: false,
      provider: this.provider,
      rawStatus: 'PROVIDER_NOT_CONFIGURED',
      message: 'No live payout provider is configured.',
    };
  }

  /**
   * Check the status of a previously initiated payment
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentResult> {
    console.log(`🔍 [Payment] Checking status of ${transactionId}`);

    if (this.provider === 'pawapay' && this.apiKey) {
       try {
         const response = await fetch(`${this.pawaPayBaseUrl}/deposits/${transactionId}`, {
           headers: { 'Authorization': `Bearer ${this.apiKey}` },
         });
         const data = await response.json();
         return {
           success: data.status === 'COMPLETED',
           transactionId,
           provider: 'pawapay',
           rawStatus: data.status,
           message: data.status || 'Unknown',
         };
       } catch (err: any) {
         return { success: false, message: err.message };
       }
    }

    if (this.provider === 'campay' && this.apiKey) {
      try {
        const response = await fetch(`https://demo.campay.net/api/transaction/${transactionId}/`, {
          headers: { 'Authorization': `Token ${this.apiKey}` },
        });
        const data = await response.json();
        return {
          success: data.status === 'SUCCESSFUL',
          transactionId,
          message: data.status || 'Unknown status',
        };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }

    return { success: false, message: 'Payment status check not available in stub mode.' };
  }
}
