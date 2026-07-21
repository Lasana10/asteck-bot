import { supabase } from '../infra/supabase';
import { EmailService } from './EmailService';
import { MetaWhatsAppService } from './MetaWhatsAppService';
import { TelegramService } from './telegram';

export type NotificationChannel = 'in_app' | 'whatsapp' | 'email' | 'telegram';

type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  referenceId?: string | null;
};

type RecipientProfile = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  telegram_id?: number | null;
  whatsapp_id?: string | null;
  email?: string | null;
  preferred_city?: string | null;
  role?: string | null;
};

function fallbackEmailFromProfile(profile: RecipientProfile) {
  const username = String(profile.whatsapp_id || '').includes('@')
    ? String(profile.whatsapp_id)
    : '';
  return username || null;
}

export class NotificationService {
  static async createInAppNotification(userId: string, payload: NotificationPayload) {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      reference_id: payload.referenceId || null,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
  }

  static async notifyProfile(
    profile: RecipientProfile,
    payload: NotificationPayload,
    channels: NotificationChannel[] = ['in_app']
  ) {
    const requested = new Set(channels);
    const delivery: Record<string, any> = {};

    if (requested.has('in_app')) {
      await this.createInAppNotification(profile.id, payload);
      delivery.in_app = { success: true };
    }

    if (requested.has('whatsapp')) {
      const target = profile.phone || profile.whatsapp_id || '';
      delivery.whatsapp = target
        ? await MetaWhatsAppService.sendText(target, `${payload.title}\n\n${payload.body}`)
        : { success: false, error: 'Recipient has no WhatsApp-capable phone.' };
    }

    if (requested.has('email')) {
      const email = fallbackEmailFromProfile(profile);
      delivery.email = email
        ? await EmailService.sendMail({
            to: email,
            subject: payload.title,
            text: payload.body,
            html: `<p>${payload.body.replace(/\n/g, '<br/>')}</p>`,
          })
        : { success: false, error: 'Recipient has no email address on file.' };
    }

    if (requested.has('telegram')) {
      if (profile.telegram_id) {
        try {
          const telegram = new TelegramService();
          await telegram.getBotInstance().telegram.sendMessage(
            profile.telegram_id,
            `*${payload.title}*\n${payload.body}`,
            { parse_mode: 'Markdown' }
          );
          delivery.telegram = { success: true };
        } catch (error: any) {
          delivery.telegram = { success: false, error: error?.message || 'Telegram delivery failed.' };
        }
      } else {
        delivery.telegram = { success: false, error: 'Recipient has no Telegram link.' };
      }
    }

    return delivery;
  }

  static async notifyMany(
    profiles: RecipientProfile[],
    payload: NotificationPayload,
    channels: NotificationChannel[] = ['in_app']
  ) {
    const results = await Promise.all(
      profiles.map(async (profile) => ({
        profile_id: profile.id,
        deliveries: await this.notifyProfile(profile, payload, channels),
      }))
    );

    return results;
  }
}
