const TERMII_BASE_URL = process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';

function normalizeIntlPhone(phone: string) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.startsWith('237')) return digits;
  return `237${digits.replace(/^0+/, '')}`;
}

export class TermiiClient {
  private static apiKey = process.env.TERMII_API_KEY || '';
  private static senderId = process.env.TERMII_SENDER_ID || process.env.ARKESEL_SENDER_ID || 'AFAT';
  private static channel = process.env.TERMII_CHANNEL || 'generic';

  static isConfigured() {
    return Boolean(this.apiKey);
  }

  static async sendOTP(phone: string) {
    if (!this.apiKey) {
      return { success: false, error: 'TERMII_API_KEY not configured' };
    }

    const to = normalizeIntlPhone(phone);
    const payload = {
      api_key: this.apiKey,
      message_type: 'NUMERIC',
      to,
      from: this.senderId,
      channel: this.channel,
      pin_attempts: 3,
      pin_time_to_live: 5,
      pin_length: 6,
      pin_placeholder: '< 123456 >',
      message_text: 'Your AFAT verification code is < 123456 >. It expires in 5 minutes.',
      pin_type: 'NUMERIC',
    };

    const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    return {
      success: response.ok && String(data?.status || '') === '200',
      pinId: data?.pinId || data?.pin_id || null,
      raw: data,
    };
  }

  static async verifyOTP(pinId: string, pin: string) {
    if (!this.apiKey) {
      return { success: false, error: 'TERMII_API_KEY not configured' };
    }

    const response = await fetch(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        pin_id: pinId,
        pin,
      }),
    });
    const data = await response.json();

    return {
      success: response.ok && String(data?.verified || '').toLowerCase() === 'true',
      raw: data,
    };
  }
}
