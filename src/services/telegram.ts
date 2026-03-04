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
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\\\$&');
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
      console.error(\`🔴 [BOT ERROR] Update \${ctx.update.update_id} failed:\`, err);
    });

    // ========== DEBUG MIDDLEWARE ==========
    this.bot.use(async (ctx, next) => {
      try {
        const update = JSON.stringify(ctx.update).substring(0, 200);
        console.log(\`📡 [RAW UPDATE] \${update}...\`);

        if (ctx.from) {
          const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : (ctx.callbackQuery ? (ctx.callbackQuery as any).data : '[Media]');
          console.log(\`💬 [MESSAGE] From: \${ctx.from.id} | Name: \${ctx.from.first_name} | Input: \${text}\`);
        }

        await next();
        console.log(\`✅ [PROCESSED] Update \${ctx.update.update_id}\`);
      } catch (err) {
        console.error(\`❌ [MIDDLEWARE ERROR] Update \${ctx.update.update_id}:\`, err);
      }
    });

    // ========== COMMANDS ==========

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const lang = this.getLang(userId);
        const isUserAdmin = this.isAdmin(userId);

        console.log(\`🚀 [START] User: \${userId} (\${lang})\`);

        // Register user in Supabase
        await getOrCreateUser(userId, ctx.from.username);

        const activeIncidents = await getActiveIncidents(12 * 60);
        const count = activeIncidents.length;

        const statusEmoji = count > 3 ? '🔴' : (count > 0 ? '🟡' : '🟢');
        const statusMsg = lang === 'pcm' ? \`\\n\\n\${statusEmoji} *System Check:* \${count} wahala dem happen for road.\` :
                          \`\\n\\n\${statusEmoji} *SITUATION:* \${count} incident(s) actif(s) / active incident(s).\`;

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
          (isUserAdmin ? '\\n\\n👑 *WELCOME GUARDIAN!* Access standard activated.' : (lang === 'fr' ? '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting' : (lang === 'pcm' ? '\\n\\n🎙️ *Notice:* Send voice note make we report fast fast!' : '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting'))),
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
        console.error(\`❌ [START ERROR]\`, err);
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
      stats.forEach((s, i) => msg += \`\${i+1}. @\${s.username || 'Anonyme'}: \${s.trustScore} pts\\n\`);
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
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.3.0 (Audited)\`,
        { parse_mode: 'Markdown' }
      );
    });
    this.bot.action('admin_broadcast', (ctx) => {
      ctx.answerCbQuery();
      return ctx.reply('📢 Type /broadcast <your message> to send to everyone.');
    });


    // /broadcast <message> - Admin only
    this.bot.command('broadcast', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const message = ctx.message.text.split(' ').slice(1).join(' ');
      if (!message) {
        return ctx.reply('⚠️ Usage: /broadcast <message>');
      }

      try {
        await this.sendToChannel(\`📢 *OFFICIAL ANNOUNCEMENT*\\n\\n\${message}\`);
        ctx.reply('✅ Broadcast sent successfully.');
      } catch (error) {
        ctx.reply('❌ Failed to broadcast.');
      }
    });

    // /admin_stats - Admin only
    this.bot.command('admin_stats', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const incidents = await getActiveIncidents(24 * 60); // Last 24h
      const pendingCount = pendingReports.size;

      ctx.replyWithMarkdown(
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.2.0 (World-Class)\`
      );
    });

    // /report - Start incident report flow
    this.bot.command('report', (ctx) => this.showIncidentTypeSelection(ctx));

    // /alerts - Show active alerts
    this.bot.command('alerts', async (ctx) => {
      await this.showActiveAlerts(ctx);
    });

    // /subscribe - Morning Brief
    this.bot.command('subscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const success = await subscribeToAlerts(userId);
      ctx.reply(success
        ? (lang === 'fr' ? '✅ Abonné au Bulletin Matinal (06h00)!' : (lang === 'pcm' ? '✅ I don subscribe you for Morning News!' : '✅ Subscribed to Morning Briefs!'))
        : '❌ Error.'
      );
    });

    // /unsubscribe - Stop briefs
    this.bot.command('unsubscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      await unsubscribeFromAlerts(userId);
      ctx.reply(lang === 'fr' ? '🔕 Désabonné.' : '🔕 Unsubscribed.');
    });

    // /nearby - Show nearby incidents
    this.bot.command('nearby', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.reply(
        MESSAGES.nearby[lang],
        this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position' : (lang === 'pcm' ? '📍 Place weh I dey' : '📍 My Location'))
      );
    });

    // Generic Button Handlers (Trilingual)
    const getButtonLabels = (key: keyof typeof MESSAGES.buttons) => [
      MESSAGES.buttons[key].fr,
      MESSAGES.buttons[key].en,
      MESSAGES.buttons[key].pcm
    ];

    // Report
    this.bot.hears(getButtonLabels('report'), (ctx) => this.showIncidentTypeSelection(ctx));

    // Alerts
    this.bot.hears(getButtonLabels('alerts'), (ctx) => this.showActiveAlerts(ctx));

    // Share Handler
    this.bot.hears(getButtonLabels('share'), (ctx) => {
      const shareText = encodeURIComponent('🚦 AsTeck Traffic Intelligence - Real-time traffic alerts for Cameroon! Join now: https://t.me/AsTeck_Bot');
      ctx.replyWithMarkdown(
        \`📲 *Spread the word!*\\n\\n\` +
        \`[Click to Share / Cliquez pour Partager](https://t.me/share/url?url=\${shareText})\`,
        { link_preview_options: { is_disabled: true } }
      );
    });

    // Emergency Contacts Handler
    this.bot.hears(['📞 POLICE (117) / GENDARMERIE (113)'], (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.replyWithMarkdown(DriverService.formatEmergencyContacts(lang));
    });

    // Stats
    this.bot.hears(getButtonLabels('stats'), (ctx) => this.showLeaderboard(ctx));

    // Tolls
    this.bot.hears(getButtonLabels('toll'), (ctx) => this.showTollsSelection(ctx));
    this.bot.command('toll', (ctx) => this.showTollsSelection(ctx));

    // Driving Tips
    this.bot.hears(getButtonLabels('tips'), (ctx) => this.showDrivingTips(ctx));
    this.bot.command('tips', (ctx) => this.showDrivingTips(ctx));
    this.bot.command('guide', (ctx) => this.showDrivingTips(ctx));

    // Emergency
    this.bot.hears(getButtonLabels('emergency'), (ctx) => this.handlePanic(ctx));

    // Sensor Mode Handler
    this.bot.hears('🔊 SENSOR MODE', (ctx) => {
      const lang = this.getLang(ctx.from!.id.toString());
      ctx.replyWithMarkdown(
        lang === 'fr'
          ? \`🔊 *SYNERGIE OS - MODE SENSEUR*\\n\\nLe bot analyse maintenant les sons ambiants pour détecter:\\n- 💥 **ACCIDENTS / CHOCS**\\n- 🕳️ **NIDS DE POULE (Sécousses)**\\n\\n_Envoyez un court vocal (5s) pendant que vous roulez pour un "check" automatique._\`
          : \`🔊 *OS SYNERGY - SENSOR MODE*\\n\\nThe bot is now analysis ambient sounds for:\\n- 💥 **ACCIDENTS / CRASHES**\\n- 🕳️ **POTHOLES (Vibrations)**\\n\\n_Send a short voice note (5s) while driving for an automatic "road check"._\`
      );
    });

    // Change Language Handler (quick toggle from menu)
    this.bot.hears(getButtonLabels('lang'), (ctx) => {
       ctx.reply('🌍 Choose your language / Choisissez votre langue / Choose wuna language:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇨🇲 Pidgin', 'lang_pcm')]
        ])
       );
    });

    // Main Menu / Reset Handler
    this.bot.hears(getButtonLabels('mainMenu'), (ctx) => {
      const userId = ctx.from.id.toString();
      pendingReports.delete(userId);
      pendingRoutes.delete(userId);
      return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
    });

    // /fuel - Fuel info
    const fuelLabels = getButtonLabels('fuel');
    this.bot.hears(fuelLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/fuel' } } as any));
    this.bot.command('fuel', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId); // Use userId here
      const isFr = lang === 'fr';
      const isPcm = lang === 'pcm';

      let priceMsg = isFr
        ? \`⛽ *Prix de Référence Carburant Cameroun:*\\n\\n\`
        : (isPcm ? \`⛽ *Carburant Money for Cameroun:*\\n\\n\` : \`⛽ *Cameroon Fuel Reference Prices:*\\n\\n\`);

      priceMsg += \`🔴 \${isFr ? 'Super' : (isPcm ? 'Super' : 'Petrol')}: \${FUEL_REFERENCE_PRICES.super} FCFA/L\\n\`;
      priceMsg += \`🟡 \${isFr ? 'Gasoil' : (isPcm ? 'Diesel' : 'Diesel')}: \${FUEL_REFERENCE_PRICES.diesel} FCFA/L\\n\`;
      priceMsg += \`🔵 \${isFr ? 'GPL' : (isPcm ? 'Gas' : 'LPG')}: \${FUEL_REFERENCE_PRICES.gas} FCFA/kg\\n\\n\`;
      priceMsg += isFr ? \`📍 _Partagez votre position pour trouver une station._\` : (isPcm ? \`📍 _Show weh you dey make we find station._\` : \`📍 _Share your location to find a station._\`);

      // Set pending state
      pendingFuel.set(userId, { step: 'awaiting_location' });

      ctx.replyWithMarkdown(
        priceMsg,
        this.getLocationKeyboard(lang, isFr ? '📍 Stations Proches' : (isPcm ? '📍 Station dem near me' : '📍 Nearby Stations'))
      );
    });

    // /route - Get directions
    const routeLabels = getButtonLabels('route');
    this.bot.hears(routeLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/route' } } as any));
    this.bot.command('route', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      pendingRoutes.set(userId, { step: 'origin' });
      ctx.reply(
        lang === 'fr'
          ? '🗺️ *Itinéraire*\\n\\n📍 Partagez votre position de DÉPART:'
          : (lang === 'pcm' ? '🗺️ *Road Guide*\\n\\n📍 Show weh you de START:' : '🗺️ *Directions*\\n\\n📍 Share your STARTING location:'),
        { parse_mode: 'Markdown',
          ...this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position Actuelle' : (lang === 'pcm' ? '📍 Weh I dey now' : '📍 Current Location'))
        }
      );
    });
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
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\\\$&');
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
      console.error(\`🔴 [BOT ERROR] Update \${ctx.update.update_id} failed:\`, err);
    });

    // ========== DEBUG MIDDLEWARE ==========
    this.bot.use(async (ctx, next) => {
      try {
        const update = JSON.stringify(ctx.update).substring(0, 200);
        console.log(\`📡 [RAW UPDATE] \${update}...\`);

        if (ctx.from) {
          const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : (ctx.callbackQuery ? (ctx.callbackQuery as any).data : '[Media]');
          console.log(\`💬 [MESSAGE] From: \${ctx.from.id} | Name: \${ctx.from.first_name} | Input: \${text}\`);
        }

        await next();
        console.log(\`✅ [PROCESSED] Update \${ctx.update.update_id}\`);
      } catch (err) {
        console.error(\`❌ [MIDDLEWARE ERROR] Update \${ctx.update.update_id}:\`, err);
      }
    });

    // ========== COMMANDS ==========

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const lang = this.getLang(userId);
        const isUserAdmin = this.isAdmin(userId);

        console.log(\`🚀 [START] User: \${userId} (\${lang})\`);

        // Register user in Supabase
        await getOrCreateUser(userId, ctx.from.username);

        const activeIncidents = await getActiveIncidents(12 * 60);
        const count = activeIncidents.length;

        const statusEmoji = count > 3 ? '🔴' : (count > 0 ? '🟡' : '🟢');
        const statusMsg = lang === 'pcm' ? \`\\n\\n\${statusEmoji} *System Check:* \${count} wahala dem happen for road.\` :
                          \`\\n\\n\${statusEmoji} *SITUATION:* \${count} incident(s) actif(s) / active incident(s).\`;

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
          (isUserAdmin ? '\\n\\n👑 *WELCOME GUARDIAN!* Access standard activated.' : (lang === 'fr' ? '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting' : (lang === 'pcm' ? '\\n\\n🎙️ *Notice:* Send voice note make we report fast fast!' : '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting'))),
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
        console.error(\`❌ [START ERROR]\`, err);
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
      stats.forEach((s, i) => msg += \`\${i+1}. @\${s.username || 'Anonyme'}: \${s.trustScore} pts\\n\`);
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
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.3.0 (Audited)\`,
        { parse_mode: 'Markdown' }
      );
    });
    this.bot.action('admin_broadcast', (ctx) => {
      ctx.answerCbQuery();
      return ctx.reply('📢 Type /broadcast <your message> to send to everyone.');
    });


    // /broadcast <message> - Admin only
    this.bot.command('broadcast', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const message = ctx.message.text.split(' ').slice(1).join(' ');
      if (!message) {
        return ctx.reply('⚠️ Usage: /broadcast <message>');
      }

      try {
        await this.sendToChannel(\`📢 *OFFICIAL ANNOUNCEMENT*\\n\\n\${message}\`);
        ctx.reply('✅ Broadcast sent successfully.');
      } catch (error) {
        ctx.reply('❌ Failed to broadcast.');
      }
    });

    // /admin_stats - Admin only
    this.bot.command('admin_stats', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const incidents = await getActiveIncidents(24 * 60); // Last 24h
      const pendingCount = pendingReports.size;

      ctx.replyWithMarkdown(
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.2.0 (World-Class)\`
      );
    });

    // /report - Start incident report flow
    this.bot.command('report', (ctx) => this.showIncidentTypeSelection(ctx));

    // /alerts - Show active alerts
    this.bot.command('alerts', async (ctx) => {
      await this.showActiveAlerts(ctx);
    });

    // /subscribe - Morning Brief
    this.bot.command('subscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const success = await subscribeToAlerts(userId);
      ctx.reply(success
        ? (lang === 'fr' ? '✅ Abonné au Bulletin Matinal (06h00)!' : (lang === 'pcm' ? '✅ I don subscribe you for Morning News!' : '✅ Subscribed to Morning Briefs!'))
        : '❌ Error.'
      );
    });

    // /unsubscribe - Stop briefs
    this.bot.command('unsubscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      await unsubscribeFromAlerts(userId);
      ctx.reply(lang === 'fr' ? '🔕 Désabonné.' : '🔕 Unsubscribed.');
    });

    // /nearby - Show nearby incidents
    this.bot.command('nearby', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.reply(
        MESSAGES.nearby[lang],
        this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position' : (lang === 'pcm' ? '📍 Place weh I dey' : '📍 My Location'))
      );
    });

    // Generic Button Handlers (Trilingual)
    const getButtonLabels = (key: keyof typeof MESSAGES.buttons) => [
      MESSAGES.buttons[key].fr,
      MESSAGES.buttons[key].en,
      MESSAGES.buttons[key].pcm
    ];

    // Report
    this.bot.hears(getButtonLabels('report'), (ctx) => this.showIncidentTypeSelection(ctx));

    // Alerts
    this.bot.hears(getButtonLabels('alerts'), (ctx) => this.showActiveAlerts(ctx));

    // Share Handler
    this.bot.hears(getButtonLabels('share'), (ctx) => {
      const shareText = encodeURIComponent('🚦 AsTeck Traffic Intelligence - Real-time traffic alerts for Cameroon! Join now: https://t.me/AsTeck_Bot');
      ctx.replyWithMarkdown(
        \`📲 *Spread the word!*\\n\\n\` +
        \`[Click to Share / Cliquez pour Partager](https://t.me/share/url?url=\${shareText})\`,
        { link_preview_options: { is_disabled: true } }
      );
    });

    // Emergency Contacts Handler
    this.bot.hears(['📞 POLICE (117) / GENDARMERIE (113)'], (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.replyWithMarkdown(DriverService.formatEmergencyContacts(lang));
    });

    // Stats
    this.bot.hears(getButtonLabels('stats'), (ctx) => this.showLeaderboard(ctx));

    // Tolls
    this.bot.hears(getButtonLabels('toll'), (ctx) => this.showTollsSelection(ctx));
    this.bot.command('toll', (ctx) => this.showTollsSelection(ctx));

    // Driving Tips
    this.bot.hears(getButtonLabels('tips'), (ctx) => this.showDrivingTips(ctx));
    this.bot.command('tips', (ctx) => this.showDrivingTips(ctx));
    this.bot.command('guide', (ctx) => this.showDrivingTips(ctx));

    // Emergency
    this.bot.hears(getButtonLabels('emergency'), (ctx) => this.handlePanic(ctx));

    // Sensor Mode Handler
    this.bot.hears('🔊 SENSOR MODE', (ctx) => {
      const lang = this.getLang(ctx.from!.id.toString());
      ctx.replyWithMarkdown(
        lang === 'fr'
          ? \`🔊 *SYNERGIE OS - MODE SENSEUR*\\n\\nLe bot analyse maintenant les sons ambiants pour détecter:\\n- 💥 **ACCIDENTS / CHOCS**\\n- 🕳️ **NIDS DE POULE (Sécousses)**\\n\\n_Envoyez un court vocal (5s) pendant que vous roulez pour un "check" automatique._\`
          : \`🔊 *OS SYNERGY - SENSOR MODE*\\n\\nThe bot is now analysis ambient sounds for:\\n- 💥 **ACCIDENTS / CRASHES**\\n- 🕳️ **POTHOLES (Vibrations)**\\n\\n_Send a short voice note (5s) while driving for an automatic "road check"._\`
      );
    });

    // Change Language Handler (quick toggle from menu)
    this.bot.hears(getButtonLabels('lang'), (ctx) => {
       ctx.reply('🌍 Choose your language / Choisissez votre langue / Choose wuna language:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇨🇲 Pidgin', 'lang_pcm')]
        ])
       );
    });

    // Main Menu / Reset Handler
    this.bot.hears(getButtonLabels('mainMenu'), (ctx) => {
      const userId = ctx.from.id.toString();
      pendingReports.delete(userId);
      pendingRoutes.delete(userId);
      return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
    });

    // /fuel - Fuel info
    const fuelLabels = getButtonLabels('fuel');
    this.bot.hears(fuelLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/fuel' } } as any));
    this.bot.command('fuel', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId); // Use userId here
      const isFr = lang === 'fr';
      const isPcm = lang === 'pcm';

      let priceMsg = isFr
        ? \`⛽ *Prix de Référence Carburant Cameroun:*\\n\\n\`
        : (isPcm ? \`⛽ *Carburant Money for Cameroun:*\\n\\n\` : \`⛽ *Cameroon Fuel Reference Prices:*\\n\\n\`);

      priceMsg += \`🔴 \${isFr ? 'Super' : (isPcm ? 'Super' : 'Petrol')}: \${FUEL_REFERENCE_PRICES.super} FCFA/L\\n\`;
      priceMsg += \`🟡 \${isFr ? 'Gasoil' : (isPcm ? 'Diesel' : 'Diesel')}: \${FUEL_REFERENCE_PRICES.diesel} FCFA/L\\n\`;
      priceMsg += \`🔵 \${isFr ? 'GPL' : (isPcm ? 'Gas' : 'LPG')}: \${FUEL_REFERENCE_PRICES.gas} FCFA/kg\\n\\n\`;
      priceMsg += isFr ? \`📍 _Partagez votre position pour trouver une station._\` : (isPcm ? \`📍 _Show weh you dey make we find station._\` : \`📍 _Share your location to find a station._\`);

      // Set pending state
      pendingFuel.set(userId, { step: 'awaiting_location' });

      ctx.replyWithMarkdown(
        priceMsg,
        this.getLocationKeyboard(lang, isFr ? '📍 Stations Proches' : (isPcm ? '📍 Station dem near me' : '📍 Nearby Stations'))
      );
    });

    // /route - Get directions
    const routeLabels = getButtonLabels('route');
    this.bot.hears(routeLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/route' } } as any));
    this.bot.command('route', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      pendingRoutes.set(userId, { step: 'origin' });
      ctx.reply(
        lang === 'fr'
          ? '🗺️ *Itinéraire*\\n\\n📍 Partagez votre position de DÉPART:'
          : (lang === 'pcm' ? '🗺️ *Road Guide*\\n\\n📍 Show weh you de START:' : '🗺️ *Directions*\\n\\n📍 Share your STARTING location:'),
        { parse_mode: 'Markdown',
          ...this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position Actuelle' : (lang === 'pcm' ? '📍 Weh I dey now' : '📍 Current Location'))
        }
      );
    });
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
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\\\$&');
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
      console.error(\`🔴 [BOT ERROR] Update \${ctx.update.update_id} failed:\`, err);
    });

    // ========== DEBUG MIDDLEWARE ==========
    this.bot.use(async (ctx, next) => {
      try {
        const update = JSON.stringify(ctx.update).substring(0, 200);
        console.log(\`📡 [RAW UPDATE] \${update}...\`);

        if (ctx.from) {
          const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : (ctx.callbackQuery ? (ctx.callbackQuery as any).data : '[Media]');
          console.log(\`💬 [MESSAGE] From: \${ctx.from.id} | Name: \${ctx.from.first_name} | Input: \${text}\`);
        }

        await next();
        console.log(\`✅ [PROCESSED] Update \${ctx.update.update_id}\`);
      } catch (err) {
        console.error(\`❌ [MIDDLEWARE ERROR] Update \${ctx.update.update_id}:\`, err);
      }
    });

    // ========== COMMANDS ==========

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const lang = this.getLang(userId);
        const isUserAdmin = this.isAdmin(userId);

        console.log(\`🚀 [START] User: \${userId} (\${lang})\`);

        // Register user in Supabase
        await getOrCreateUser(userId, ctx.from.username);

        const activeIncidents = await getActiveIncidents(12 * 60);
        const count = activeIncidents.length;

        const statusEmoji = count > 3 ? '🔴' : (count > 0 ? '🟡' : '🟢');
        const statusMsg = lang === 'pcm' ? \`\\n\\n\${statusEmoji} *System Check:* \${count} wahala dem happen for road.\` :
                          \`\\n\\n\${statusEmoji} *SITUATION:* \${count} incident(s) actif(s) / active incident(s).\`;

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
          (isUserAdmin ? '\\n\\n👑 *WELCOME GUARDIAN!* Access standard activated.' : (lang === 'fr' ? '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting' : (lang === 'pcm' ? '\\n\\n🎙️ *Notice:* Send voice note make we report fast fast!' : '\\n\\n🎙️ *INFO:* Vocal = Signalement / Voice = Reporting'))),
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
        console.error(\`❌ [START ERROR]\`, err);
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
      stats.forEach((s, i) => msg += \`\${i+1}. @\${s.username || 'Anonyme'}: \${s.trustScore} pts\\n\`);
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
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.3.0 (Audited)\`,
        { parse_mode: 'Markdown' }
      );
    });
    this.bot.action('admin_broadcast', (ctx) => {
      ctx.answerCbQuery();
      return ctx.reply('📢 Type /broadcast <your message> to send to everyone.');
    });


    // /broadcast <message> - Admin only
    this.bot.command('broadcast', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const message = ctx.message.text.split(' ').slice(1).join(' ');
      if (!message) {
        return ctx.reply('⚠️ Usage: /broadcast <message>');
      }

      try {
        await this.sendToChannel(\`📢 *OFFICIAL ANNOUNCEMENT*\\n\\n\${message}\`);
        ctx.reply('✅ Broadcast sent successfully.');
      } catch (error) {
        ctx.reply('❌ Failed to broadcast.');
      }
    });

    // /admin_stats - Admin only
    this.bot.command('admin_stats', async (ctx) => {
      const userId = ctx.from.id.toString();
      if (!this.isAdmin(userId)) return;

      const incidents = await getActiveIncidents(24 * 60); // Last 24h
      const pendingCount = pendingReports.size;

      ctx.replyWithMarkdown(
        \`📉 *System Statistics (24h)*\\n\\n\` +
        \`🚨 Active Incidents: \${incidents.length}\\n\` +
        \`⏳ Pending Flows: \${pendingCount}\\n\` +
        \`🤖 Bot Version: 1.2.0 (World-Class)\`
      );
    });

    // /report - Start incident report flow
    this.bot.command('report', (ctx) => this.showIncidentTypeSelection(ctx));

    // /alerts - Show active alerts
    this.bot.command('alerts', async (ctx) => {
      await this.showActiveAlerts(ctx);
    });

    // /subscribe - Morning Brief
    this.bot.command('subscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const success = await subscribeToAlerts(userId);
      ctx.reply(success
        ? (lang === 'fr' ? '✅ Abonné au Bulletin Matinal (06h00)!' : (lang === 'pcm' ? '✅ I don subscribe you for Morning News!' : '✅ Subscribed to Morning Briefs!'))
        : '❌ Error.'
      );
    });

    // /unsubscribe - Stop briefs
    this.bot.command('unsubscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      await unsubscribeFromAlerts(userId);
      ctx.reply(lang === 'fr' ? '🔕 Désabonné.' : '🔕 Unsubscribed.');
    });

    // /nearby - Show nearby incidents
    this.bot.command('nearby', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.reply(
        MESSAGES.nearby[lang],
        this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position' : (lang === 'pcm' ? '📍 Place weh I dey' : '📍 My Location'))
      );
    });

    // Generic Button Handlers (Trilingual)
    const getButtonLabels = (key: keyof typeof MESSAGES.buttons) => [
      MESSAGES.buttons[key].fr,
      MESSAGES.buttons[key].en,
      MESSAGES.buttons[key].pcm
    ];

    // Report
    this.bot.hears(getButtonLabels('report'), (ctx) => this.showIncidentTypeSelection(ctx));

    // Alerts
    this.bot.hears(getButtonLabels('alerts'), (ctx) => this.showActiveAlerts(ctx));

    // Share Handler
    this.bot.hears(getButtonLabels('share'), (ctx) => {
      const shareText = encodeURIComponent('🚦 AsTeck Traffic Intelligence - Real-time traffic alerts for Cameroon! Join now: https://t.me/AsTeck_Bot');
      ctx.replyWithMarkdown(
        \`📲 *Spread the word!*\\n\\n\` +
        \`[Click to Share / Cliquez pour Partager](https://t.me/share/url?url=\${shareText})\`,
        { link_preview_options: { is_disabled: true } }
      );
    });

    // Emergency Contacts Handler
    this.bot.hears(['📞 POLICE (117) / GENDARMERIE (113)'], (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.replyWithMarkdown(DriverService.formatEmergencyContacts(lang));
    });

    // Stats
    this.bot.hears(getButtonLabels('stats'), (ctx) => this.showLeaderboard(ctx));

    // Tolls
    this.bot.hears(getButtonLabels('toll'), (ctx) => this.showTollsSelection(ctx));
    this.bot.command('toll', (ctx) => this.showTollsSelection(ctx));

    // Driving Tips
    this.bot.hears(getButtonLabels('tips'), (ctx) => this.showDrivingTips(ctx));
    this.bot.command('tips', (ctx) => this.showDrivingTips(ctx));
    this.bot.command('guide', (ctx) => this.showDrivingTips(ctx));

    // Emergency
    this.bot.hears(getButtonLabels('emergency'), (ctx) => this.handlePanic(ctx));

    // Sensor Mode Handler
    this.bot.hears('🔊 SENSOR MODE', (ctx) => {
      const lang = this.getLang(ctx.from!.id.toString());
      ctx.replyWithMarkdown(
        lang === 'fr'
          ? \`🔊 *SYNERGIE OS - MODE SENSEUR*\\n\\nLe bot analyse maintenant les sons ambiants pour détecter:\\n- 💥 **ACCIDENTS / CHOCS**\\n- 🕳️ **NIDS DE POULE (Sécousses)**\\n\\n_Envoyez un court vocal (5s) pendant que vous roulez pour un "check" automatique._\`
          : \`🔊 *OS SYNERGY - SENSOR MODE*\\n\\nThe bot is now analysis ambient sounds for:\\n- 💥 **ACCIDENTS / CRASHES**\\n- 🕳️ **POTHOLES (Vibrations)**\\n\\n_Send a short voice note (5s) while driving for an automatic "road check"._\`
      );
    });

    // Change Language Handler (quick toggle from menu)
    this.bot.hears(getButtonLabels('lang'), (ctx) => {
       ctx.reply('🌍 Choose your language / Choisissez votre langue / Choose wuna language:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇨🇲 Pidgin', 'lang_pcm')]
        ])
       );
    });

    // Main Menu / Reset Handler
    this.bot.hears(getButtonLabels('mainMenu'), (ctx) => {
      const userId = ctx.from.id.toString();
      pendingReports.delete(userId);
      pendingRoutes.delete(userId);
      return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
    });

    // /fuel - Fuel info
    const fuelLabels = getButtonLabels('fuel');
    this.bot.hears(fuelLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/fuel' } } as any));
    this.bot.command('fuel', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId); // Use userId here
      const isFr = lang === 'fr';
      const isPcm = lang === 'pcm';

      let priceMsg = isFr
        ? \`⛽ *Prix de Référence Carburant Cameroun:*\\n\\n\`
        : (isPcm ? \`⛽ *Carburant Money for Cameroun:*\\n\\n\` : \`⛽ *Cameroon Fuel Reference Prices:*\\n\\n\`);

      priceMsg += \`🔴 \${isFr ? 'Super' : (isPcm ? 'Super' : 'Petrol')}: \${FUEL_REFERENCE_PRICES.super} FCFA/L\\n\`;
      priceMsg += \`🟡 \${isFr ? 'Gasoil' : (isPcm ? 'Diesel' : 'Diesel')}: \${FUEL_REFERENCE_PRICES.diesel} FCFA/L\\n\`;
      priceMsg += \`🔵 \${isFr ? 'GPL' : (isPcm ? 'Gas' : 'LPG')}: \${FUEL_REFERENCE_PRICES.gas} FCFA/kg\\n\\n\`;
      priceMsg += isFr ? \`📍 _Partagez votre position pour trouver une station._\` : (isPcm ? \`📍 _Show weh you dey make we find station._\` : \`📍 _Share your location to find a station._\`);

      // Set pending state
      pendingFuel.set(userId, { step: 'awaiting_location' });

      ctx.replyWithMarkdown(
        priceMsg,
        this.getLocationKeyboard(lang, isFr ? '📍 Stations Proches' : (isPcm ? '📍 Station dem near me' : '📍 Nearby Stations'))
      );
    });

    // /route - Get directions
    const routeLabels = getButtonLabels('route');
    this.bot.hears(routeLabels, (ctx) => this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/route' } } as any));
    this.bot.command('route', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      pendingRoutes.set(userId, { step: 'origin' });
      ctx.reply(
        lang === 'fr'
          ? '🗺️ *Itinéraire*\\n\\n📍 Partagez votre position de DÉPART:'
          : (lang === 'pcm' ? '🗺️ *Road Guide*\\n\\n📍 Show weh you de START:' : '🗺️ *Directions*\\n\\n📍 Share your STARTING location:'),
        { parse_mode: 'Markdown',
          ...this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position Actuelle' : (lang === 'pcm' ? '📍 Weh I dey now' : '📍 Current Location'))
        }
      );
    });
    // NOTE: /toll handler already registered via showTollsSelection above

    // /emergency - Emergency contacts
    this.bot.command('emergency', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.replyWithMarkdown(DriverService.formatEmergencyContacts(lang));
    });

    // /tips - Driving tips
    this.bot.command('tips', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      const tip = DriverService.getSeasonalTip();
      ctx.replyWithMarkdown(
        lang === 'fr'
          ? `💡 *Conseil de Conduite:*\n\n${tip.fr}`
          : `💡 *Driving Tip:*\n\n${tip.en}`,
        Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'fr' ? '🔄 Autre conseil' : '🔄 Another tip', 'next_tip')]
        ])
      );
    });

    // /leaderboard - Top community reporters
    this.bot.command('leaderboard', async (ctx) => {
      await this.showLeaderboard(ctx);
    });

    // /mystats - User statistics
    this.bot.command('mystats', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const user = await getOrCreateUser(userId, ctx.from.username);

      if (user) {
        const badge = getUserBadge(user.trustScore, user.reportsCount);
        const trustBar = '█'.repeat(Math.round(user.trustScore / 10)) + '░'.repeat(10 - Math.round(user.trustScore / 10));

        const isFr = lang === 'fr';
        const isPcm = lang === 'pcm';

        let msg = isFr ? `📊 *Vos Statistiques AsTeck:*\n\n` : (isPcm ? `📊 *Your AsTeck Level:*\n\n` : `📊 *Your AsTeck Statistics:*\n\n`);
        msg += `${badge}\n\n`;
        msg += `🛡️ ${isFr ? 'Confiance' : (isPcm ? 'Trust' : 'Trust')}: [${trustBar}] ${user.trustScore}/100\n`;
        msg += `📝 ${isFr ? 'Signalements' : (isPcm ? 'Reports' : 'Reports')}: ${user.reportsCount}\n`;
        msg += `✅ ${isFr ? 'Précis' : (isPcm ? 'Correct' : 'Accurate')}: ${user.accurateReports}\n\n`;
        msg += isFr ? `_Continuez à signaler pour monter en grade!_` : (isPcm ? `_Keep de report make you level up!_` : `_Keep reporting to level up!_`);

        ctx.replyWithMarkdown(msg);
      }
    });

    // /help - Help message
    this.bot.command('help', (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      ctx.replyWithMarkdown(MESSAGES.help[lang] + SAFETY_REMINDER[lang]);
    });

    // /contacts - Manage emergency proxies
    this.bot.command('contacts', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      const user = await getOrCreateUser(userId, ctx.from.username);

      const text = ctx.message.text.split(' ');
      if (text.length === 1) {
        // Just show current contacts
        const contacts = user?.emergencyContacts || [];
        let msg = lang === 'fr' ? '🛡️ *Vos Contacts d\'Urgence:*' : '🛡️ *Your Emergency Contacts:*';
        if (contacts.length === 0) {
          msg += lang === 'fr' ? '\n\nAucun contact configuré.' : '\n\nNo contacts configured.';
        } else {
          contacts.forEach((id, i) => msg += `\n${i+1}. \`${id}\``);
        }
        msg += lang === 'fr'
          ? '\n\nUtilisez:\n- `/contacts add <ID>` pour ajouter\n- `/contacts clear` pour vider'
          : '\n\nUse:\n- `/contacts add <ID>` to add\n- `/contacts clear` to clear';
        return ctx.replyWithMarkdown(msg);
      }

      if (text[1] === 'add' && text[2]) {
        const current = user?.emergencyContacts || [];
        if (current.length >= 3) {
          return ctx.reply(lang === 'fr' ? '❌ Max 3 contacts.' : '❌ Max 3 contacts.');
        }
        await updateUserContacts(userId, [...current, text[2]]);
        return ctx.reply(lang === 'fr' ? '✅ Contact ajouté!' : '✅ Contact added!');
      }

      if (text[1] === 'clear') {
        await updateUserContacts(userId, []);
        return ctx.reply(lang === 'fr' ? '✅ Liste vidée.' : '✅ Contacts cleared.');
      }
    });

    // /premium - Financial Services (MoMo Flow)
    this.bot.command('premium', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);

      const msg = lang === 'fr'
        ? `💎 *AsTeck Guardian Tier*\n\n` +
          `Abonnez-vous pour des fonctionnalités avancées:\n` +
          `- Alertes SOS Prioritaires\n` +
          `- Rapports de trafic détaillés par IA\n` +
          `- Support Premium\n\n` +
          `💰 *Prix:* 500 FCFA / mois`
        : `💎 *AsTeck Guardian Tier*\n\n` +
          `Subscribe for advanced features:\n` +
          `- Priority SOS Alerts\n` +
          `- Detailed AI Traffic Briefs\n` +
          `- Premium Support\n\n` +
          `💰 *Price:* 500 FCFA / month`;

      ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('💳 PAY VIA MOBILE MONEY (MOCK)', 'pay_momo')]
      ]));
    });

    this.bot.action('pay_momo', async (ctx) => {
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);

      ctx.answerCbQuery();
      ctx.editMessageText(
        lang === 'fr'
          ? '📱 *USSD PUSH SÉCURISÉ ENVOYÉ...*\n\nComposez *126# (MTN) ou #150# (Orange) sur votre téléphone pour confirmer le paiement de 500 FCFA.'
          : '📱 *SECURED USSD PUSH SENT...*\n\nDial *126# (MTN) or #150# (Orange) on your phone to confirm the 500 FCFA payment.',
        { parse_mode: 'Markdown' }
      );

      // Simulate network delay then grant access
      setTimeout(async () => {
        await updateUserSubscription(userId, 'guardian');
        this.bot.telegram.sendMessage(userId,
          lang === 'fr'
            ? '🎊 *BRAVO!* Vous êtes maintenant un membre GUARDIAN.'
            : '🎊 *CONGRATS!* You are now a GUARDIAN member.',
          { parse_mode: 'Markdown' }
        );
      }, 5000);
    });

    // /lang - Change language
    this.bot.command('lang', (ctx) => {
      ctx.reply(
        '🌍 Choose your language / Choisissez votre langue / Choose wuna language:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇨🇲 Pidgin', 'lang_pcm')],
        ])
      );
    });

    // ========== MESSAGE HANDLERS (Intelligent AI Processing) ==========

    // Voice messages -> Gemini 2.5 Analysis
    this.bot.on('voice', async (ctx) => {
      await this.handleVoice(ctx);
    });

    // Photos -> Gemini 2.5 Analysis
    this.bot.on('photo', async (ctx) => {
      await this.handlePhoto(ctx);
    });

    // Location messages
    this.bot.on('location', async (ctx) => {
      const userId = ctx.from!.id.toString();

      // Ensure ctx.message and ctx.message.location exist
      if (!ctx.message || !('location' in ctx.message)) {
        console.warn(`[LOCATION HANDLER] Received location update without location data for user ${userId}`);
        return;
      }

      // Check if this is for a route request
      const routeReq = pendingRoutes.get(userId);
      if (routeReq) {
        await this.handleRouteLocation(ctx, routeReq);
        return;
      }

      // Check if this is for fuel request
      const fuelReq = pendingFuel.get(userId);
      if (fuelReq && fuelReq.step === 'awaiting_location') {
        pendingFuel.delete(userId); // Clear generic pending, specific flow might restart if they click update
        await this.findFuel(ctx, { latitude: ctx.message.location.latitude, longitude: ctx.message.location.longitude });
        return;
      }

      // Check if this is for a pending report
      await this.handleLocation(ctx);
    });

    // Text fallback (Smart Analysis)
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);

      // 1. SOS/Panic Keywords
      if (text.toLowerCase() === 'sos' || text.toLowerCase() === 'panic' || text.toLowerCase() === 'urgence' || /\b(sos|urgence|emergency|help|au secours)\b/i.test(text)) {
        return this.handlePanic(ctx);
      }

      // 2. Fuel Price Update (Crowdsourcing)
      const fuelState = pendingFuel.get(userId);
      if (fuelState && fuelState.step === 'awaiting_price' && fuelState.stationId && fuelState.fuelType) {
        const price = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(price) || price < 100 || price > 2000) {
          return ctx.reply(lang === 'fr' ? '⚠️ Prix invalide. Veuillez entrer un nombre (ex: 730).' : '⚠️ Invalid price. Please enter a number (e.g. 730).');
        }

        const stations = await getNearbyFuel({ latitude: 0, longitude: 0 }, 10000); 
        const station = stations.find(s => s.id === fuelState.stationId);

        if (station) {
          const updatedStation: any = {
            ...station,
            petrolPrice: fuelState.fuelType === 'petrol' ? price : station.petrolPrice,
            dieselPrice: fuelState.fuelType === 'diesel' ? price : station.dieselPrice,
            gasPrice: fuelState.fuelType === 'gas' ? price : station.gasPrice,
            reportedBy: userId
          };
          delete updatedStation.id;
          delete updatedStation.lastUpdated;

          await saveFuelPrice(updatedStation);
          pendingFuel.delete(userId);

          return ctx.reply(lang === 'fr'
            ? `✅ Merci! Le prix de ${fuelState.fuelType} à *${station.name}* a été mis à jour à ${price} FCFA.`
            : `✅ Thank you! The price of ${fuelState.fuelType} at *${station.name}* don change to ${price} FCFA.`);
        }
      }

      // 2. Navigation / Reset
      const menuLabels = getButtonLabels('mainMenu');
      if (text === '/start' || menuLabels.includes(text)) {
        pendingReports.delete(userId);
        pendingRoutes.delete(userId);
        return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
      }

      // 3. Pending Flows (Description)
      const pending = pendingReports.get(userId);
      if (pending && pending.step === 'awaiting_description') {
        pending.description = text;
        pending.step = 'awaiting_location';
        pendingReports.set(userId, pending);

        const locLabel = lang === 'pcm' ? '📍 Show weh I dey' : '📍 Partager Ma Position';
        return ctx.replyWithMarkdown(MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, locLabel));
      }

      const routeReq = pendingRoutes.get(userId);
      if (routeReq && routeReq.step === 'destination' && routeReq.origin) {
        ctx.reply(lang === 'fr' ? '📍 Destination (📎 → Location):' : '📍 Destination (📎 → Location):');
        return;
      }

      // 4. Smart analysis for direct reports
      if (!pending && !routeReq) {
        ctx.replyWithChatAction('typing');
        const parsed = await brainService.analyze(text);
        if (parsed && parsed.type !== 'other') {
          pendingReports.set(userId, {
            userId, type: parsed.type, description: parsed.description, severity: parsed.severity,
            step: 'awaiting_location', createdAt: new Date()
          });

          const typeInfo = INCIDENT_TYPES[parsed.type];
          const typeLabel = lang === 'fr' ? typeInfo.labelFr : (lang === 'pcm' ? typeInfo.labelPcm : typeInfo.labelEn);
          let msg = `${typeInfo.emoji} *${typeLabel}* detected!\n\n` + MESSAGES.shareLocation[lang];
          if (parsed.type === 'police_control') msg += POLICE_DISCLAIMER[lang];

          const locLabel = lang === 'pcm' ? '📍 Show weh I dey' : '📍 Partager Ma Position';
          return ctx.replyWithMarkdown(msg, this.getLocationKeyboard(lang, locLabel));
        }

        // 5. AI-Powered Smart Response
        ctx.sendChatAction('typing');
        const aiResponse = await geminiClient.queryLive(`The user said: "${text}". Brief response (~3 lines) about Cameroon traffic/roads.`, lang);
        ctx.replyWithMarkdown(aiResponse ? `🤖 ${aiResponse}` : '🤖 Need help? Use buttons above.');
      }
    });

    // Incident type selection
    Object.keys(INCIDENT_TYPES).forEach((type) => {
      this.bot.action(`type_${type}`, (ctx) => {
        this.handleIncidentTypeSelection(ctx, type as IncidentType);
      });
    });

    this.bot.action('sos_confirm', (ctx) => { this.finalizeSOS(ctx); });
  // ========== VOICE HANDLER (Gemini 2.5) ==========
  private async handleVoice(ctx: Context) {
    try {
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);
      ctx.replyWithChatAction('typing');
      const statusMsg = await ctx.reply(lang === 'fr' ? '🎙️ _Analyse du vocal en cours..._' : '🎙️ _Processing voice note..._', { parse_mode: 'Markdown' });

      if (!ctx.message || !('voice' in ctx.message)) throw new Error('No voice');
      const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const baseAnalysis = await geminiClient.analyzeVoice(link.href);
      try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch (e) {}

      const analysis = await brainService.orchestrate(baseAnalysis?.description || '', baseAnalysis);
      if (!analysis) throw new Error('Fail');

      const isAuto = analysis.sensorData?.potentialCrash || analysis.sensorData?.potholeHit;
      if (analysis.type !== 'other' || isAuto) {
        const finalType = isAuto ? (analysis.sensorData?.potentialCrash ? 'accident' : 'road_damage') : analysis.type as IncidentType;
        pendingReports.set(userId, {
          userId, type: finalType, description: analysis.description, severity: isAuto ? 4 : (analysis.severity || 3),
          step: 'awaiting_location', createdAt: new Date()
        });

        const typeInfo = INCIDENT_TYPES[finalType];
        const typeLabel = lang === 'fr' ? typeInfo.labelFr : (lang === 'pcm' ? typeInfo.labelPcm : typeInfo.labelEn);
        ctx.replyWithMarkdown(\`🎙️ *AI Report:*\\n\\n⚠️ *Type:* \${typeInfo.emoji} \${typeLabel}\\n🤖 *Note:* "\${analysis.description}"\\n\\n\` + MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
      } else {
        const smart = await geminiClient.queryLive(\`User sent voice note: "\${analysis.description}". Respond helpfuly.\`, lang);
        ctx.replyWithMarkdown(\`🤖 \${smart || 'I no hear well.'}\`);
      }
    } catch (err: any) {
      console.error('Voice Error:', err);
      ctx.reply('❌ Voice analysis failed. Please type your report.');
    }
  }

  private async handlePhoto(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    if (!ctx.message || !('photo' in ctx.message)) return;
    const link = await ctx.telegram.getFileLink(ctx.message.photo.pop()!.file_id);
    const analysis = await geminiClient.analyzePhoto(link.href);

    if (analysis && analysis.type !== 'other') {
      pendingReports.set(userId, {
        userId, type: analysis.type as IncidentType, description: analysis.description,
        severity: analysis.severity as any, mediaUrl: link.href, step: 'awaiting_location', createdAt: new Date()
      });
      ctx.replyWithMarkdown(\`📸 *AI Photo Analysis:*\\n\\n⚠️ *Type:* \${analysis.type}\\n📝 *Note:* "\${analysis.description}"\\n\\n\` + MESSAGES.shareLocation[lang], this.getLocationKeyboard(lang, '📍 Confirm Location'));
    }
  }

  private async showActiveAlerts(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const incidents = await getActiveIncidents(4 * 60);
    if (incidents.length === 0) return ctx.reply('✅ No major incidents.');
    for (const inc of incidents.slice(0, 5)) ctx.replyWithMarkdown(DriverService.formatIncidentMessage(inc, lang));
  }

  private async showNearbyIncidents(ctx: Context, location: Coordinates) {
    const lang = this.getLang(ctx.from!.id.toString());
    const nearby = await getNearbyIncidents(location, 5);
    if (nearby.length === 0) {
      const ai = await geminiClient.queryLive(\`User at GPS \${location.latitude}, \${location.longitude} in Cameroon. Give Area Intelligence.\`, lang);
      return ctx.replyWithMarkdown(\`✅ *Road Clear (Reports)*\\n\\n🤖 *Area Intelligence:*\\n\${ai || 'Clear road.'}\`);
    }

    ctx.reply(\`⚠️ *Nearby Incidents (\${nearby.length}):*\`);
    for (const inc of nearby) ctx.replyWithMarkdown(DriverService.formatIncidentMessage(inc, lang));
  }

  private async showLeaderboard(ctx: Context) {
    const stats = await getLeaderboard();
    const lang = this.getLang(ctx.from!.id.toString());
    let msg = MESSAGES.leaderboardHeader[lang];
    stats.forEach((s, i) => msg += \`\${i+1}. @\${s.username || 'Anon'}: \${s.trustScore} pts\\n\`);
    ctx.replyWithMarkdown(msg);
  }

  private showTollsSelection(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    ctx.replyWithMarkdown(DriverService.formatAllTolls(lang), Markup.inlineKeyboard(CAMEROON_TOLL_ROUTES.map((r, i) => [Markup.button.callback(\`📋 \${r.origin} → \${r.destination}\`, \`toll_\${i}\`)])));
  }

  private showDrivingTips(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const tip = DriverService.getSeasonalTip();
    ctx.replyWithMarkdown(\`💡 *Driving Tip:*\\n\\n\${tip[lang === 'fr' ? 'fr' : 'en']}\`, Markup.inlineKeyboard([[Markup.button.callback('🔄 Another', 'next_tip')]]));
  }

  private async handlePanic(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    ctx.reply('🚨 *SOS RECEIVED!* Sending alerts...', { parse_mode: 'Markdown' });
    ctx.replyWithMarkdown('📍 *URGENT:* Share your location!', this.getLocationKeyboard(lang, '🚨 SOS LOCATION'));
    pendingReports.set(userId, { userId, type: 'accident', severity: 5, description: 'SOS PANIC', step: 'awaiting_location', createdAt: new Date() });
  }

  private async findFuel(ctx: Context, location: Coordinates) {
    const lang = this.getLang(ctx.from!.id.toString());
    const stations = await getNearbyFuel(location, 5);
    if (stations.length > 0) {
      let msg = \`⛽ *Nearby Gas Stations:*\\n\\n\`;
      for (const s of stations.slice(0, 3)) msg += \`🏪 *\${s.name}*\\n- Super: \${s.petrolPrice} FCFA\\n\\n\`;
      await ctx.replyWithMarkdown(msg);
    } else {
      const ai = await geminiClient.queryLive(\`Gas stations near GPS \${location.latitude}, \${location.longitude} Cameroon.\`, lang);
      if (ai) await ctx.replyWithMarkdown(\`⛽ *AI Fuel Search:*\\n\${ai}\`);
    }
  }

  private async handleRouteLocation(ctx: Context, req: { origin?: Coordinates; destination?: Coordinates; step: 'origin' | 'destination' }) {
    const userId = ctx.from!.id.toString();
    const loc = { latitude: (ctx.message as any).location.latitude, longitude: (ctx.message as any).location.longitude };
    if (req.step === 'origin') {
      req.origin = loc; req.step = 'destination'; pendingRoutes.set(userId, req);
      ctx.reply('🏁 Destination (📎 → Location):', Markup.keyboard([[Markup.button.locationRequest('📍 Destination')]]).resize());
    } else {
      req.destination = loc; pendingRoutes.delete(userId);
      const route = await DirectionsService.getDirections(req.origin!, loc);
      if (route) ctx.replyWithMarkdown(\`🛣️ *Itinéraire AsTeck*\\n\${route.primary.summary}\`, this.getPersistentKeyboard(this.getLang(userId)));
    }
  }

  public async sendToChannel(message: string, isCritical: boolean = false) {
    if (this.channelId) {
      const sent = await this.bot.telegram.sendMessage(this.channelId, isCritical ? \`🚨 *CRITICAL*\\n\${message}\` : message, { parse_mode: 'Markdown' });
      if (isCritical) await this.bot.telegram.pinChatMessage(this.channelId, sent.message_id).catch(() => {});
    }
  }

  public async launch() {
    console.log('📡 Starting AsTeck Bot...');
    try {
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await new Promise(r => setTimeout(r, 2000));
      await this.bot.launch({ dropPendingUpdates: true });
      console.log('🤖 AsTeck Bot World-Class AI Live!');
    } catch (e) {
      console.error('Launch failed');
    }
  }
}
