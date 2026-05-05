import { createEscrow } from '../infra/rent_repository';
import { RentEscrow, EscrowStatus } from '../types';
import { supabase } from '../infra/supabase';

import { PaymentService } from './payment';

export class EscrowService {
  /**
   * Initialize a trust-based escrow for a property unlock
   */
  static async lockMicroFee(renterId: string, propertyId: string, amount: number = 1000): Promise<RentEscrow | null> {
    const paymentService = new PaymentService();
    
    // We assume the user ID is their phone number for MVP (via USSD or Telegram)
    const phone = renterId;
    
    // Trigger PawaPay Mobile Money Push
    const payment = await paymentService.initiateMomoPayment(
      phone, 
      amount, 
      `Unlock Property ${propertyId.substring(0,6)}`, 
      'pawapay'
    );

    const escrow: Omit<RentEscrow, 'id' | 'createdAt'> = {
      renterId,
      propertyId,
      amountXaf: amount,
      status: payment.success ? 'pending' : 'refunded', // Keep internal state aligned
      momo_reference: payment.transactionId,
      heldUntil: new Date(Date.now() + 48 * 60 * 60 * 1000) // Hold for 48 hours
    };

    const saved = await createEscrow(escrow);
    if (saved && !payment.success) {
       console.warn(`[Escrow] PawaPay push failed for ${phone}. Reason: ${payment.message}`);
    }
    
    return saved;
  }

  /**
   * Confirm payment from Mobile Money webhook
   */
  static async confirmPayment(escrowId: string, momoRef: string): Promise<boolean> {
    const { error } = await supabase
      .from('rent_escrow')
      .update({ 
        status: 'held',
        momo_reference: momoRef 
      })
      .eq('id', escrowId);

    return !error;
  }

  /**
   * Release fee after a successful visit verification
   */
  static async releaseToPartner(escrowId: string): Promise<boolean> {
    const { error } = await supabase
      .from('rent_escrow')
      .update({ status: 'released' })
      .eq('id', escrowId);

    // Business Logic: 40% to agent, 60% to platform (or as configured)
    return !error;
  }

  /**
   * Refund fee if the property was a scam or mismatch
   */
  static async refundRenter(escrowId: string): Promise<boolean> {
    const { error } = await supabase
      .from('rent_escrow')
      .update({ status: 'refunded' })
      .eq('id', escrowId);

    return !error;
  }
}
