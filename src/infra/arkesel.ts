/**
 * ============================================================================
 * ARKESEL CLIENT — Cost-Optimized SMS + OTP Gateway
 * ============================================================================
 * Replaces Africa's Talking for lower-cost operations in Cameroon/Ghana.
 * API v2: https://sms.arkesel.com/api/v2/sms/send
 * Auth: api-key header
 * ============================================================================
 */

import crypto from 'crypto';

const ARKESEL_API_URL = 'https://sms.arkesel.com/api/v2/sms/send';

// In-memory OTP store (production: use Redis/Supabase)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export class ArkeselClient {
  private static apiKey = process.env.ARKESEL_API_KEY || '';
  private static senderId = process.env.ARKESEL_SENDER_ID || 'SENTINEL';

  /**
   * Send SMS via Arkesel v2 API
   */
  static async sendSMS(to: string, message: string, senderId?: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[Arkesel STUB] SMS to ${to}: "${message.slice(0, 60)}..."`);
      return true; // Stub mode
    }

    try {
      const formattedTo = to.startsWith('+') ? to.replace('+', '') : to;
      
      const response = await fetch(ARKESEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          sender: senderId || this.senderId,
          message,
          recipients: [formattedTo],
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.status === 'success') {
        console.log(`[Arkesel] ✅ SMS sent to ${to}`);
        return true;
      }
      
      console.error(`[Arkesel] ❌ SMS failed:`, data);
      return false;
    } catch (err: any) {
      console.error(`[Arkesel] ❌ Network error:`, err.message);
      return false;
    }
  }

  /**
   * Generate and send OTP via Arkesel SMS
   */
  static async sendOTP(phone: string): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const formattedPhone = phone.startsWith('+') ? phone : `+237${phone}`;

    // Store with 5-minute expiry
    otpStore.set(formattedPhone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const message = `[Sentinel Atlas] Votre code: ${code}. Expire dans 5 min. Ne partagez pas.\nYour code: ${code}. Expires in 5 min.`;
    
    await this.sendSMS(formattedPhone, message);
    
    // Always log in dev for debugging
    if (!this.apiKey) {
      console.log(`[Arkesel OTP STUB] Phone: ${formattedPhone} | Code: ${code}`);
    }

    return code;
  }

  /**
   * Verify OTP code
   */
  static verifyOTP(phone: string, code: string): boolean {
    const formattedPhone = phone.startsWith('+') ? phone : `+237${phone}`;
    const stored = otpStore.get(formattedPhone);

    if (!stored) return false;
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(formattedPhone);
      return false;
    }
    if (stored.code !== code) return false;

    // One-time use
    otpStore.delete(formattedPhone);
    return true;
  }

  /**
   * Send a transactional notification (payment receipt, booking confirm, etc.)
   */
  static async sendNotification(phone: string, title: string, body: string): Promise<boolean> {
    return this.sendSMS(phone, `🛡️ ${title}\n\n${body}\n\n— Sentinel Atlas OS`);
  }
}
