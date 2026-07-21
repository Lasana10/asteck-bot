type WhatsAppResult = {
  success: boolean;
  error?: string;
  response?: any;
};

function normalizePhoneNumber(value: string) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.startsWith('237') ? digits : `237${digits.replace(/^0+/, '')}`;
}

export class MetaWhatsAppService {
  private static apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
  private static phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  private static token = process.env.WHATSAPP_PERMANENT_ACCESS_TOKEN || '';

  static isConfigured() {
    return Boolean(this.phoneNumberId && this.token);
  }

  static async sendText(to: string, body: string): Promise<WhatsAppResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Meta WhatsApp Cloud API is not configured.' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizePhoneNumber(to),
            type: 'text',
            text: { preview_url: false, body },
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: data?.error?.message || 'WhatsApp delivery failed.',
          response: data,
        };
      }

      return { success: true, response: data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'WhatsApp delivery failed.' };
    }
  }
}
