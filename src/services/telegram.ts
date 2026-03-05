import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { Update, Message } from 'telegraf/types';
import dotenv from 'dotenv';
import { GeoService } from './geo';
import { WeatherService } from './weather';
import { DirectionsService, DirectionsResult } from './directions';
import { DriverService, CAMEROON_TOLL_ROUTES, FUEL_REFERENCE_PRICES } from './driver';
import { geminiClient } from '../infra/gemini';
import { brainService } from './brain';
import {
  createIncident,
  getActiveIncidents,
  getNearbyIncidents,
  updateIncidentConfirmations,
  getOrCreateUser,
  incrementUserReports,
  updateUserTrustScore,
  addConfirmation,
  getLeaderboard,
  getUserBadge,
  subscribeToAlerts,
  unsubscribeFromAlerts,
  saveFuelPrice,
  getNearbyFuel,
  updateUserContacts,
  updateUserSubscription,
} from '../infra/supabase';
import {
  IncidentType,
  Severity,
  INCIDENT_TYPES,
  SEVERITY_LABELS,
  MESSAGES,
  POLICE_DISCLAIMER,
  SAFETY_REMINDER,
  PendingReport,
  Incident,
  Coordinates,
  Language,
  FuelStation
} from '../types';

dotenv.config();

// In-memory store for pending reports (user flow state)
const pendingReports = new Map<string, PendingReport>();

// User language preferences (default: French for Cameroon)
const userLanguages = new Map<string, Language>();

// In-memory state
const pendingRoutes = new Map<string, { origin?: Coordinates; destination?: Coordinates; step: 'origin' | 'destination' }>();
const pendingFuel = new Map<string, { step: 'awaiting_location' | 'awaiting_price'; stationId?: string; fuelType?: 'petrol' | 'diesel' | 'gas' }>();
const adminStates = new Map<string, { step: 'broadcast_message' }>();

export class TelegramService {
  private bot: Telegraf;
  private channelId: string | undefined;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing');

    this.bot = new Telegraf(token);
    this.channelId = process.env.TELEGRAM_CHANNEL_ID;

    this.initializeHandlers();
  }

  private getLang(userId: string): Language {
    return userLanguages.get(userId) || 'fr';
  }

  private isAdmin(userId: string): boolean {
    const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
    return adminIds.includes(userId.toString());
  }

  /** Helper to get the full persistent menu keyboard */
  private getPersistentKeyboard(lang: Language) {
    return Markup.keyboard([
      [MESSAGES.buttons.report[lang], MESSAGES.buttons.alerts[lang], MESSAGES.buttons.fuel[lang]],
      [MESSAGES.buttons.route[lang], MESSAGES.buttons.toll[lang], '🔊 SENSOR MODE'],
      [MESSAGES.buttons.emergency[lang], MESSAGES.buttons.stats[lang], MESSAGES.buttons.share[lang]],
      [MESSAGES.buttons.lang[lang], MESSAGES.buttons.mainMenu[lang]]
    ]).resize();
  }

  /** Helper to get location keyboard with FULL persistent menu attached */
  private getLocationKeyboard(lang: Language, label: string) {
    return Markup.keyboard([
      [Markup.button.locationRequest(label)],
      [MESSAGES.buttons.report[lang], MESSAGES.buttons.alerts[lang], MESSAGES.buttons.fuel[lang]],
      [MESSAGES.buttons.route[lang], MESSAGES.buttons.toll[lang], MESSAGES.buttons.tips[lang]],
      [MESSAGES.buttons.emergency[lang], MESSAGES.buttons.stats[lang], MESSAGES.buttons.share[lang]],
      [MESSAGES.buttons.lang[lang], MESSAGES.buttons.mainMenu[lang]]
    ]).resize();
  }

  /** Helper to escape markdown characters */
  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  /** Expose bot for scheduler and webhooks */
  public getBotInstance() {
    return this.bot;
  }

  public getWebhookCallback() {
      return this.bot.webhookCallback('/');
  }

  /** Delete any existing webhook (needed for clean polling mode) */
  public async deleteWebhook() {
    await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
  }

  private initializeHandlers() {
    // Generic bot error handler
    this.bot.catch((err, ctx) => {
      console.error(`🔴 [BOT ERROR] Update ${ctx.update.update_id} failed:`, err);
    });

    // ========== DEBUG MIDDLEWARE ==========
    this.bot.use(async (ctx, next) => {
      try {
        const update = JSON.stringify(ctx.update).substring(0, 200);
        console.log(`📡 [RAW UPDATE] ${update}...`);

        if (ctx.from) {
          const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : (ctx.callbackQuery ? (ctx.callbackQuery as any).data : '[Media]');
          console.log(`💬 [MESSAGE] From: ${ctx.from.id} | Name: ${ctx.from.first_name} | Input: ${text}`);
        }

        await next();
        console.log(`✅ [PROCESSED] Update ${ctx.update.update_id}`);
      } catch (err) {
        console.error(`❌ [MIDDLEWARE ERROR] Update ${ctx.update.update_id}:`, err);
      }
    });

    // ========== COMMANDS ==========

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const lang = this.getLang(userId);
        const isUserAdmin = this.isAdmin(userId);

        console.log(`🚀 [START] User: ${userId} (${lang})`);

        // Register user in Supabase
        await getOrCreateUser(userId, ctx.from.username);

        const activeIncidents = await getActiveIncidents(12 * 60);
        const count = activeIncidents.length;

        const statusEmoji = count > 3 ? '🔴' : (count > 0 ? '🟡' : '🟢');
        const statusMsg = lang === 'pcm' ? `\n\n${statusEmoji} *System Check:* ${count} wahala dem happen for road.` :
                          `\n\n${statusEmoji} *SITUATION:* ${count} incident(s) actif(s) / active incident(s).`;

        const inlineButtons = [
          [
            Markup.button.callback(MESSAGES.buttons.report[lang], 'menu_report'),
            Markup.button.callback(MESSAGES.buttons.alerts[lang], 'menu_alerts')
          ],
          [
            Markup.button.callback(MESSAGES.buttons.fuel[lang], 'menu_fuel'),
            Markup.button.callback(MESSAGES.buttons.route[lang], 'menu_route')
          ]
        ];

        if (isUserAdmin) {
          inlineButtons.push([
            Markup.button.callback('🛡️ DIFFUSION / BROADCAST', 'admin_broadcast'),
            Markup.button.callback('📈 STATS ADMIN', 'admin_stats')
          ]);
        }

        // 1. Send Welcome message
        await ctx.replyWithMarkdown(
          MESSAGES.welcome[lang] + statusMsg +
          (isUserAdmin ? '\n\n👑 *WELCOME GUARDIAN!* Access standard activated.' : (lang === 'fr' ? '\n\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting' : (lang === 'pcm' ? '\n\n🎙️ *Notice:* Send voice note make we report fast fast!' : '\n\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting'))),
          this.getPersistentKeyboard(lang)
        );

        // 2. Send Inline Options
        await ctx.reply(
          lang === 'fr' ? '⬇️ *Actions Rapides:*' : (lang === 'pcm' ? '⬇️ *Waka Fast:*' : '⬇️ *Quick Actions:*'),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              ...inlineButtons,
              [
                Markup.button.callback('🇫🇷 Français', 'lang_fr'),
                Markup.button.callback('🇬🇧 English', 'lang_en'),
                Markup.button.callback('🇨🇲 Pidgin', 'lang_pcm')
              ]
            ])
          }
        );
      } catch (err) {
        console.error(`❌ [START ERROR]`, err);
        ctx.reply('❌ Sorry, something went wrong while starting the bot. Please try again later.');
      }
    });

    // /panic - Instant SOS
    this.bot.command('panic', async (ctx) => {
      await this.handlePanic(ctx);
    });

    // ========== CALLBACK HANDLERS (Zero-Typing) ==========
    this.bot.action('menu_report', (ctx) => {
      ctx.answerCbQuery();
      return this.showIncidentTypeSelection(ctx);
    });
    this.bot.action('menu_alerts', (ctx) => {
      ctx.answerCbQuery();
      return this.showActiveAlerts(ctx);
    });
    this.bot.action('menu_fuel', (ctx) => {
      ctx.answerCbQuery();
      return ctx.reply(MESSAGES.fuelPrompt[this.getLang(ctx.from!.id.toString())]);
    });
    this.bot.action('menu_stats', async (ctx) => {
      const stats = await getLeaderboard();
      const lang = this.getLang(ctx.from!.id.toString());
      let msg = MESSAGES.leaderboardHeader[lang];
      stats.forEach((s, i) => msg += `${i+1}. @${s.username || 'Anonyme'}: ${s.trustScore} pts\n`);
      ctx.answerCbQuery();
      ctx.replyWithMarkdown(msg);
    });
    this.bot.action('menu_panic', (ctx) => {
      ctx.answerCbQuery();
      return this.handlePanic(ctx);
    });

    this.bot.action('lang_fr', (ctx) => {
      userLanguages.set(ctx.from!.id.toString(), 'fr');
      ctx.answerCbQuery('🇫🇷 Français');
      ctx.editMessageText('✅ Langue: Français. Tapez /start pour voir le menu.');
    });
    this.bot.action('lang_en', (ctx) => {
      userLanguages.set(ctx.from!.id.toString(), 'en');
      ctx.answerCbQuery('🇬🇧 English');
      ctx.editMessageText('✅ Language: English. Type /start to see the menu.');
    });
    this.bot.action('lang_pcm', (ctx) => {
      userLanguages.set(ctx.from!.id.toString(), 'pcm');
      ctx.answerCbQuery('🇨🇲 Pidgin');
      ctx.editMessageText('✅ Language: Pidgin. Type /start to see the menu.');
    });
    this.bot.action('admin_stats', async (ctx) => {
      ctx.answerCbQuery();
      const userId = ctx.from!.id.toString();
      if (!this.isAdmin(userId)) return;
      const incidents = await getActiveIncidents(24 * 60);
      const pendingCount = pendingReports.size;
      ctx.reply(
        `📉 *System Statistics (24h)*\n\n` +
        `🚨 Active Incidents: ${incidents.length}\n` +
        `⏳ Pending Flows: ${pendingCount}\n` +
        `🤖 Bot Version: 1.3.0 (Elite Mode)`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.action('admin_broadcast', (ctx) => {
      ctx.answerCbQuery();
      return ctx.reply('📢 Type /broadcast <your message> to send to everyone.');
    });

    this.bot.command('broadcast', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;
      const message = ctx.message.text.split(' ').slice(1).join(' ');
      if (!message) return ctx.reply('⚠️ Usage: /broadcast <message>');
      try {
        await this.sendToChannel(`📢 *OFFICIAL ANNOUNCEMENT*\n\n${message}`);
        ctx.reply('✅ Broadcast sent successfully.');
      } catch (error) {
        ctx.reply('❌ Failed to broadcast.');
      }
    });

    this.bot.command('report', (ctx) => this.showIncidentTypeSelection(ctx));
    this.bot.command('alerts', async (ctx) => this.showActiveAlerts(ctx));

    this.bot.command('subscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const success = await subscribeToAlerts(userId);
      ctx.reply(success
        ? (lang === 'fr' ? '✅ Abonné au Bulletin Matinal (06h00)!' : (lang === 'pcm' ? '✅ I don subscribe you for Morning News!' : '✅ Subscribed to Morning Briefs!'))
        : '❌ Error.'
      );
    });

    this.bot.command('unsubscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      await unsubscribeFromAlerts(userId);
      ctx.reply(lang === 'fr' ? '🔕 Désabonné.' : '🔕 Unsubscribed.');
    });

    this.bot.command('nearby', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.reply(MESSAGES.nearby[lang], this.getLocationKeyboard(lang, '📍 My Location'));
    });

    const getButtonLabels = (key: keyof typeof MESSAGES.buttons) => [
      MESSAGES.buttons[key].fr, MESSAGES.buttons[key].en, MESSAGES.buttons[key].pcm
    ];

    this.bot.hears(getButtonLabels('report'), (ctx) => this.showIncidentTypeSelection(ctx));
    this.bot.hears(getButtonLabels('alerts'), (ctx) => this.showActiveAlerts(ctx));
    this.bot.hears(getButtonLabels('share'), (ctx) => {
      const shareText = encodeURIComponent('🚦 Real-time traffic alerts for Cameroon! Join now: https://t.me/AsTeck_Bot');
      ctx.replyWithMarkdown(`📲 *Spread the word!*\n\n[Click to Share](https://t.me/share/url?url=${shareText})`);
    });

    this.bot.hears(getButtonLabels('stats'), (ctx) => this.showLeaderboard(ctx));
    this.bot.hears(getButtonLabels('toll'), (ctx) => this.showTollsSelection(ctx));
    this.bot.hears(getButtonLabels('tips'), (ctx) => this.showDrivingTips(ctx));
    this.bot.hears(getButtonLabels('emergency'), (ctx) => this.handlePanic(ctx));

    this.bot.hears('🔊 SENSOR MODE', (ctx) => {
      const lang = this.getLang(ctx.from!.id.toString());
      ctx.replyWithMarkdown(lang === 'fr' 
        ? `🔊 *SYNERGIE OS - MODE SENSEUR*\n\nVocal (5s) pour analyse auto.` 
        : `🔊 *OS SYNERGY - SENSOR MODE*\n\nVoice (5s) for auto check.`);
    });

    this.bot.hears(getButtonLabels('mainMenu'), (ctx) => {
      const userId = ctx.from.id.toString();
      pendingReports.delete(userId);
      pendingRoutes.delete(userId);
      return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
    });

    this.bot.command('fuel', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      pendingFuel.set(userId, { step: 'awaiting_location' });
      ctx.replyWithMarkdown(MESSAGES.fuelPrompt[lang], this.getLocationKeyboard(lang, '📍 Nearby Stations'));
    });

    this.bot.command('route', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      pendingRoutes.set(userId, { step: 'origin' });
      ctx.reply('🗺️ Share your START location:', this.getLocationKeyboard(lang, '📍 Origin'));
    });

    this.bot.on('voice', (ctx) => this.handleVoice(ctx));
    this.bot.on('photo', (ctx) => this.handlePhoto(ctx));
    this.bot.on('location', (ctx) => this.handleLocation(ctx));

    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);

      if (/\b(sos|urgence|emergency|help)\b/i.test(text)) return this.handlePanic(ctx);

      const pending = pendingReports.get(userId);
      if (pending && pending.step === 'awaiting_description') {
        pending.description = text;
        pending.step = 'awaiting_location';
        pendingReports.set(userId, pending);
        return ctx.replyWithMarkdown(MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
      }

      ctx.sendChatAction('typing');
      const parsed = await brainService.analyze(text);
      if (parsed && parsed.type !== 'other') {
        pendingReports.set(userId, { userId, type: parsed.type, description: parsed.description, severity: parsed.severity, step: 'awaiting_location', createdAt: new Date() });
        const typeInfo = INCIDENT_TYPES[parsed.type];
        return ctx.replyWithMarkdown(`${typeInfo.emoji} *${parsed.type}* detected!\n\n` + MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
      }

      const ai = await geminiClient.queryLive(text, lang);
      ctx.replyWithMarkdown(ai ? `🤖 ${ai}` : '🤖 How can I help you today?');
    });

    Object.keys(INCIDENT_TYPES).forEach((type) => {
      this.bot.action(`type_${type}`, (ctx) => this.handleIncidentTypeSelection(ctx, type as IncidentType));
    });
  }
  private async handleVoice(ctx: Context) {
    try {
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);
      if (!ctx.message || !('voice' in ctx.message)) return;
      
      const statusMsg = await ctx.reply(lang === 'fr' ? '🎙️ _Analyse du vocal..._' : '🎙️ _Analyzing voice..._', { parse_mode: 'Markdown' });
      const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      
      const baseAnalysis = await geminiClient.analyzeVoice(link.href);
      await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});

      const analysis = await brainService.orchestrate(baseAnalysis?.description || '', baseAnalysis);
      if (!analysis) return;

      const isAuto = analysis.sensorData?.potentialCrash || analysis.sensorData?.potholeHit;
      if (analysis.type !== 'other' || isAuto) {
        const finalType = isAuto ? (analysis.sensorData?.potentialCrash ? 'accident' : 'road_damage') : analysis.type as IncidentType;
        pendingReports.set(userId, { userId, type: finalType, description: analysis.description, severity: isAuto ? 4 : (analysis.severity || 3), step: 'awaiting_location', createdAt: new Date() });
        
        const typeInfo = INCIDENT_TYPES[finalType];
        ctx.replyWithMarkdown(`🎙️ *AI Report:* ${typeInfo.emoji} ${analysis.description}\n\n` + MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
      } else {
        const ai = await geminiClient.queryLive(`User voice: "${analysis.description}"`, lang);
        ctx.replyWithMarkdown(`🤖 ${ai || 'I hear you.'}`);
      }
    } catch (err) { console.error('Voice Error:', err); }
  }

  private async handlePhoto(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    if (!ctx.message || !('photo' in ctx.message)) return;
    const link = await ctx.telegram.getFileLink(ctx.message.photo.pop()!.file_id);
    const analysis = await geminiClient.analyzePhoto(link.href);

    if (analysis && analysis.type !== 'other') {
      pendingReports.set(userId, { userId, type: analysis.type as IncidentType, description: analysis.description, severity: analysis.severity as any, mediaUrl: link.href, step: 'awaiting_location', createdAt: new Date() });
      ctx.replyWithMarkdown(`📸 *AI Photo Analysis:* ${analysis.description}\n\n` + MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
    }
  }

  private async handleLocation(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const loc = (ctx.message as any).location;
    const pending = pendingReports.get(userId);
    const lang = this.getLang(userId);

    if (pending) {
      const incident: Incident = {
        type: pending.type, description: pending.description || '', location: { latitude: loc.latitude, longitude: loc.longitude },
        severity: pending.severity || 3, status: 'pending', reporterId: userId, reporterUsername: ctx.from?.username || 'Anon',
        confirmations: 0, mediaUrl: pending.mediaUrl, expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), createdAt: new Date()
      };
      const saved = await createIncident(incident);
      await incrementUserReports(userId);
      pendingReports.delete(userId);
      ctx.replyWithMarkdown(MESSAGES.reportReceived[lang], this.getPersistentKeyboard(lang));
      if (saved && this.channelId) this.sendToChannel(DriverService.formatIncidentMessage(saved, 'fr'), saved.severity >= 4);
    } else {
      await this.showNearbyIncidents(ctx, loc);
    }
  }

  private showIncidentTypeSelection(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const buttons = Object.entries(INCIDENT_TYPES).map(([k, v]) => [Markup.button.callback(`${v.emoji} ${lang === 'fr' ? v.labelFr : v.labelEn}`, `type_${k}`)]);
    ctx.replyWithMarkdown(MESSAGES.selectType[lang], Markup.inlineKeyboard(buttons));
  }

  private handleIncidentTypeSelection(ctx: Context, type: IncidentType) {
    const userId = ctx.from!.id.toString();
    pendingReports.set(userId, { userId, type, step: 'awaiting_description', createdAt: new Date() });
    ctx.answerCbQuery();
    ctx.editMessageText('📝 ' + (this.getLang(userId) === 'fr' ? 'Décrivez l\'incident:' : 'Describe the situation:'), { parse_mode: 'Markdown' });
  }

  private async showActiveAlerts(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const incidents = await getActiveIncidents();
    if (incidents.length === 0) return ctx.reply(MESSAGES.noActiveAlerts[lang]);
    for (const inc of incidents.slice(0, 5)) ctx.replyWithMarkdown(DriverService.formatIncidentMessage(inc, lang));
  }

  private async showNearbyIncidents(ctx: Context, location: Coordinates) {
    const lang = this.getLang(ctx.from!.id.toString());
    const nearby = await getNearbyIncidents(location, 5);
    if (nearby.length === 0) {
      const ai = await geminiClient.queryLive(`Traffic report near GPS ${location.latitude}, ${location.longitude} Cameroon. neighborhood? condition? tip?`, lang);
      return ctx.replyWithMarkdown(`✅ *Road Clear*\n\n🤖 *Area Intel:* ${ai}`);
    }
    nearby.forEach(inc => ctx.replyWithMarkdown(DriverService.formatIncidentMessage(inc, lang)));
  }

  private async showLeaderboard(ctx: Context) {
    const stats = await getLeaderboard();
    const lang = this.getLang(ctx.from!.id.toString());
    let msg = MESSAGES.leaderboardHeader[lang];
    stats.forEach((s, i) => msg += `${i+1}. @${s.username || 'Anon'}: ${s.trustScore} pts\n`);
    ctx.replyWithMarkdown(msg);
  }

  private showTollsSelection(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    ctx.replyWithMarkdown(DriverService.formatAllTolls(lang), Markup.inlineKeyboard(CAMEROON_TOLL_ROUTES.map((r, i) => [Markup.button.callback(`${r.origin} → ${r.destination}`, `toll_${i}`)])));
  }

  private showDrivingTips(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const tip = DriverService.getSeasonalTip();
    ctx.replyWithMarkdown(`💡 *Tip:* ${tip[lang === 'fr' ? 'fr' : 'en']}`, Markup.inlineKeyboard([[Markup.button.callback('🔄 Next', 'next_tip')]]));
  }

  private async handlePanic(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    ctx.reply('🚨 *SOS ACTIVATED!* Sending alerts...', { parse_mode: 'Markdown' });
    ctx.replyWithMarkdown('📍 *URGENT:* Share your Location!', this.getLocationKeyboard(lang, '🚨 SOS LOCATION'));
    pendingReports.set(userId, { userId, type: 'accident', severity: 5, description: 'SOS PANIC BUTTON', step: 'awaiting_location', createdAt: new Date() });
  }

  private async findFuel(ctx: Context, location: Coordinates) {
    const lang = this.getLang(ctx.from!.id.toString());
    const stations = await getNearbyFuel(location, 5);
    if (stations.length > 0) {
      let msg = `⛽ *Nearby Stations:*\n\n`;
      stations.forEach(s => msg += `🏪 *${s.name}*: Super ${s.petrolPrice} FCFA\n`);
      ctx.replyWithMarkdown(msg);
    } else {
      const ai = await geminiClient.queryLive(`Fuel near GPS ${location.latitude}, ${location.longitude} Cameroon. neighborhood? stations?`, lang);
      ctx.replyWithMarkdown(`⛽ *AI Fuel Check:* ${ai}`);
    }
  }

  private async handleRouteLocation(ctx: Context, req: { origin?: Coordinates; destination?: Coordinates; step: 'origin' | 'destination' }) {
    const userId = ctx.from!.id.toString();
    const loc = (ctx.message as any).location;
    if (req.step === 'origin') {
      req.origin = loc; req.step = 'destination'; pendingRoutes.set(userId, req);
      ctx.reply('🏁 Destination (📎 → Location):', Markup.keyboard([[Markup.button.locationRequest('📍 Destination')]]).resize());
    } else {
      req.destination = loc; pendingRoutes.delete(userId);
      const route = await DirectionsService.getDirections(req.origin!, loc);
      if (route) ctx.replyWithMarkdown(`🛣️ *Route:* ${route.primary.summary}`, this.getPersistentKeyboard(this.getLang(userId)));
    }
  }

  public async sendToChannel(message: string, isCritical: boolean = false) {
    if (this.channelId) await this.bot.telegram.sendMessage(this.channelId, isCritical ? `🚨 *CRITICAL*\n${message}` : message, { parse_mode: 'Markdown' });
  }

  public async launch() {
    console.log('📡 Launching AsTeck Elite Engine...');
    try {
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await this.bot.launch({ dropPendingUpdates: true });
      console.log('🤖 AsTeck Bot World-Class Live!');
    } catch (e) { console.error('Launch failed'); }
  }
}
