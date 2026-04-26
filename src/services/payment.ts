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
}

export class PaymentService {
  private apiKey: string;
  private provider: string;

  constructor() {
    this.apiKey = process.env.PAYMENT_API_KEY || '';
    this.provider = process.env.PAYMENT_PROVIDER || 'pawapay'; // pawapay | campay | africastalking
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
    preferredProvider?: 'africastalking' | 'pawapay'
  ): Promise<PaymentResult> {
    const providerOrder: ('pawapay' | 'africastalking')[] = preferredProvider 
      ? [preferredProvider] 
      : (this.provider === 'pawapay' ? ['pawapay', 'africastalking'] : ['africastalking', 'pawapay']);

    let lastError = '';

    for (const providerToTry of providerOrder) {
      const result = await this.tryProviderPayment(providerToTry, payerPhone, amount, recipientDescription);
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
    recipientDescription: string
  ): Promise<PaymentResult> {
    const formattedPhone = payerPhone.startsWith('+') ? payerPhone : `+237${payerPhone}`;
    const transactionId = `asteck_${Date.now()}`;
    
    console.log(`💰 [Payment] ${provider.toUpperCase()} Push: ${amount} XAF from ${formattedPhone}`);

    // ── PROVIDER: PawaPay (Elite/QR/Modern) ───────────────────────────────
    if (provider === 'pawapay' && this.apiKey) {
      try {
        const correspondent = formattedPhone.includes('67') || formattedPhone.includes('650') || formattedPhone.includes('68') 
          ? 'MTN_MOMO_CMR' 
          : 'ORANGE_MONEY_CMR';

        const response = await fetch('https://api.pawapay.cloud/deposits', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            depositId: transactionId,
            amount: amount.toString(),
            currency: 'XAF',
            country: 'CMR',
            correspondent,
            payer: { address: { value: formattedPhone } },
            customerTimestamp: new Date().toISOString(),
            statementDescription: `AsTeck: ${recipientDescription}`
          }),
        });

        const data = await response.json();
        if (response.ok) {
          return {
            success: true,
            transactionId,
            message: `PawaPay push initiated via ${correspondent}.`,
          };
        }
      } catch (err: any) {
        console.error('❌ [Payment] PawaPay Error:', err.message);
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

    // ── STUB MODE ──────────────────────────────────────────────────────
    return {
      success: true,
      transactionId: `stub_${Date.now()}`,
      message: `[STUB] ${amount} XAF processed.`,
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
    const formattedPhone = recipientPhone.startsWith('+') ? recipientPhone : `+237${recipientPhone}`;
    const payoutId = `payout_${Date.now()}`;
    const correspondent = formattedPhone.includes('67') || formattedPhone.includes('650') || formattedPhone.includes('68') 
      ? 'MTN_MOMO_CMR' 
      : 'ORANGE_MONEY_CMR';

    console.log(`🏦 [Cash-Out] PawaPay Payout: ${amount} XAF to ${formattedPhone} (${correspondent})`);

    if (this.provider === 'pawapay' && this.apiKey) {
      try {
        const response = await fetch('https://api.pawapay.cloud/payouts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payoutId,
            amount: amount.toString(),
            currency: 'XAF',
            country: 'CMR',
            correspondent,
            recipient: {
              address: { value: formattedPhone }
            },
            customerTimestamp: new Date().toISOString(),
            statementDescription: 'AsTeck Earnings Withdrawal'
          }),
        });

        const data = await response.json();

        if (response.ok && (data.status === 'ACCEPTED' || data.status === 'SUBMITTED' || data.status === 'PENDING')) {
          return {
            success: true,
            transactionId: payoutId,
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

    return {
      success: true,
      transactionId: `stub_b2c_${Date.now()}`,
      message: `[STUB] ${amount} XAF cash-out successful.`,
    };
  }

  /**
   * Check the status of a previously initiated payment
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentResult> {
    console.log(`🔍 [Payment] Checking status of ${transactionId}`);

    if (this.provider === 'pawapay' && this.apiKey) {
       try {
         const response = await fetch(`https://api.pawapay.cloud/deposits/${transactionId}`, {
           headers: { 'Authorization': `Bearer ${this.apiKey}` },
         });
         const data = await response.json();
         return {
           success: data.status === 'COMPLETED',
           transactionId,
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
