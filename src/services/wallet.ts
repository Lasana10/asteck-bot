/**
 * ============================================================================
 * WALLET SERVICE — Internal Ledger & Point Conversion
 * ============================================================================
 * Handles the mapping between "Trust Points" (Gamification) and "XAF" (Real Money).
 * 
 * Conversion Rate: 1 Point = 5 XAF (Adjustable)
 * ============================================================================
 */

import { supabase } from '../infra/supabase';
import { PaymentService } from './payment';

export interface WalletBalance {
  points: number;
  availableXAF: number;
}

export class WalletService {
  private payment: PaymentService;
  private CONVERSION_RATE = 5; // 1 point = 5 XAF

  constructor() {
    this.payment = new PaymentService();
  }

  /**
   * Get user balance and its monetary value
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('trust_points')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return { points: 0, availableXAF: 0 };
    }

    return {
      points: profile.trust_points,
      availableXAF: profile.trust_points * this.CONVERSION_RATE,
    };
  }

  /**
   * Cash-out trust points to MoMo
   */
  async cashOut(userId: string, pointsToConvert: number): Promise<{ success: boolean; message: string }> {
    const { points, availableXAF } = await this.getBalance(userId);

    if (pointsToConvert > points) {
      return { success: false, message: 'Points insuffisants. / Insufficient points.' };
    }

    if (pointsToConvert < 100) {
      return { success: false, message: 'Minimum 100 points pour le cash-out. / Minimum 100 points for cash-out.' };
    }

    const { data: profile } = await supabase.from('profiles').select('phone').eq('id', userId).single();
    if (!profile?.phone) {
      return { success: false, message: 'Numéro de téléphone introuvable. / Phone not found.' };
    }

    const xafAmount = pointsToConvert * this.CONVERSION_RATE;

    // 1. Deduct points from database (atomic via RPC if possible, or simple update)
    const { error: deductErr } = await supabase.rpc('deduct_points', {
      p_user_id: userId,
      p_amount: pointsToConvert,
      p_reason: 'Cash-out Trust Points'
    });

    if (deductErr) {
      return { success: false, message: 'Erreur lors de la déduction. / Point deduction failed.' };
    }

    // 2. Trigger MoMo B2C payment
    const paymentResult = await this.payment.initiateCashOut(profile.phone, xafAmount);

    if (!paymentResult.success) {
      // Revert points if payment fails (Simple strategy for now)
      await supabase.rpc('award_points', {
        p_user_id: userId,
        p_amount: pointsToConvert,
        p_reason: 'Reversed: Cash-out Failure'
      });
      return { success: false, message: `Paiement échoué: ${paymentResult.message}` };
    }

    return { success: true, message: `Cash-out réussi! ${xafAmount} XAF envoyés au ${profile.phone}.` };
  }

  /**
   * Get ledger history
   */
  async getHistory(userId: string) {
    const { data, error } = await supabase
      .from('trust_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return data || [];
  }
}
