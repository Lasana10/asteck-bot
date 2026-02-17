import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { Update, Message } from 'telegraf/types';
import dotenv from 'dotenv';
import { GeoService } from './geo';
import { WeatherService } from './weather';
import { DirectionsService, DirectionsResult } from './directions';
import { DriverService, CAMEROON_TOLL_ROUTES, FUEL_REFERENCE_PRICES } from './driver';
import { geminiClient } from '../infra/gemini';
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
    this.bot.action('admin_stats', (ctx) => {
      ctx.answerCbQuery();
      return this.bot.handleUpdate(ctx.update);
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
        await this.sendToChannel(`📢 *OFFICIAL ANNOUNCEMENT*\n\n${message}`);
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
        `📉 *System Statistics (24h)*\n\n` +
        `🚨 Active Incidents: ${incidents.length}\n` +
        `⏳ Pending Flows: ${pendingCount}\n` +
        `🤖 Bot Version: 1.2.0 (World-Class)`
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
        `📲 *Spread the word!*\n\n` +
        `[Click to Share / Cliquez pour Partager](https://t.me/share/url?url=${shareText})`,
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
          ? `🔊 *SYNERGIE OS - MODE SENSEUR*\n\nLe bot analyse maintenant les sons ambiants pour détecter:\n- 💥 **ACCIDENTS / CHOCS**\n- 🕳️ **NIDS DE POULE (Sécousses)**\n\n_Envoyez un court vocal (5s) pendant que vous roulez pour un "check" automatique._`
          : `🔊 *OS SYNERGY - SENSOR MODE*\n\nThe bot is now analysis ambient sounds for:\n- 💥 **ACCIDENTS / CRASHES**\n- 🕳️ **POTHOLES (Vibrations)**\n\n_Send a short voice note (5s) while driving for an automatic "road check"._`
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
        ? `⛽ *Prix de Référence Carburant Cameroun:*\n\n`
        : (isPcm ? `⛽ *Carburant Money for Cameroun:*\n\n` : `⛽ *Cameroon Fuel Reference Prices:*\n\n`);

      priceMsg += `🔴 ${isFr ? 'Super' : (isPcm ? 'Super' : 'Petrol')}: ${FUEL_REFERENCE_PRICES.super} FCFA/L\n`;
      priceMsg += `🟡 ${isFr ? 'Gasoil' : (isPcm ? 'Diesel' : 'Diesel')}: ${FUEL_REFERENCE_PRICES.diesel} FCFA/L\n`;
      priceMsg += `🔵 ${isFr ? 'GPL' : (isPcm ? 'Gas' : 'LPG')}: ${FUEL_REFERENCE_PRICES.gas} FCFA/kg\n\n`;
      priceMsg += isFr ? `📍 _Partagez votre position pour trouver une station._` : (isPcm ? `📍 _Show weh you dey make we find station._` : `📍 _Share your location to find a station._`);

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
          ? '🗺️ *Itinéraire*\n\n📍 Partagez votre position de DÉPART:'
          : (lang === 'pcm' ? '🗺️ *Road Guide*\n\n📍 Show weh you de START:' : '🗺️ *Directions*\n\n📍 Share your STARTING location:'),
        { parse_mode: 'Markdown',
          ...this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Ma Position Actuelle' : (lang === 'pcm' ? '📍 Weh I dey now' : '📍 Current Location'))
        }
      );
    });

    // /toll - Toll information
    this.bot.command('toll', (ctx) => {
      const lang = this.getLang(ctx.from.id.toString());
      ctx.replyWithMarkdown(
        DriverService.formatAllTolls(lang),
        Markup.inlineKeyboard(
          CAMEROON_TOLL_ROUTES.map((r, i) => [
            Markup.button.callback(
              `📋 ${r.origin} → ${r.destination}`,
              `toll_${i}`
            )
          ])
        )
      );
    });

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

    // /subscribe - Subscribe to morning briefs
    this.bot.command('subscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);

      const success = await subscribeToAlerts(userId);
      ctx.reply(success
        ? (lang === 'fr' ? '✅ Abonné au Bulletin Matinal (06h00)!' : (lang === 'pcm' ? '✅ I don subscribe you for Morning News!' : '✅ Subscribed to Morning Briefs!'))
        : (lang === 'fr' ? '❌ Erreur' : '❌ Error')
      );
    });

    this.bot.command('unsubscribe', async (ctx) => {
      const userId = ctx.from.id.toString();
      const lang = this.getLang(userId);
      await unsubscribeFromAlerts(userId);
      ctx.reply(lang === 'fr' ? '✅ Désabonné' : (lang === 'pcm' ? '✅ You don comot' : '✅ Unsubscribed'));
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

      // 2. Fuel Price Update (Community Crowdsourcing)
      const fuelState = pendingFuel.get(userId);
      if (fuelState && fuelState.step === 'awaiting_price' && fuelState.stationId && fuelState.fuelType) {
        const price = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(price) || price < 100 || price > 2000) {
          return ctx.reply(lang === 'fr' ? '⚠️ Prix invalide. Veuillez entrer un nombre (ex: 730).' : '⚠️ Invalid price. Please enter a number (e.g. 730).');
        }

        // Get station details to update
        const stations = await getNearbyFuel({ latitude: 0, longitude: 0 }, 10000); // Hacky way to find it or we need getStationById
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

      // 2. Navigation / Reset (Allow escaping flows)
      const menuLabels = getButtonLabels('mainMenu');
      if (text === '/start' || menuLabels.includes(text)) {
        pendingReports.delete(userId);
        pendingRoutes.delete(userId);
        return this.bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start' } } as any);
      }

      // 3. Pending Flows (Description / Route Destination)
      const pending = pendingReports.get(userId);
      if (pending && pending.step === 'awaiting_description') {
        pending.description = text;
        pending.step = 'awaiting_location';
        pendingReports.set(userId, pending);

        const locLabel = lang === 'pcm' ? '📍 Show weh I dey' : '📍 Partager Ma Position / Share My Location';
        return ctx.replyWithMarkdown(
          MESSAGES.shareLocation[lang],
          this.getLocationKeyboard(lang, locLabel)
        );
      }

      const routeReq = pendingRoutes.get(userId);
      if (routeReq && routeReq.step === 'destination' && routeReq.origin) {
        ctx.reply(
          lang === 'fr'
            ? '📍 Veuillez partager la POSITION de destination (cliquez 📎 → Location):'
            : (lang === 'pcm' ? '📍 Show the PLACE weh you de go (click 📎 → Location):' : '📍 Please share the destination LOCATION (click 📎 → Location):'),
        );
        return;
      }

      // 4. Smart analysis for direct reports (if not in flow)
      if (!pending && !routeReq) {
        ctx.replyWithChatAction('typing');
        const parsed = await geminiClient.analyzeText(text);
        if (parsed && parsed.type !== 'other') {
          pendingReports.set(userId, {
            userId,
            type: parsed.type,
            description: parsed.description,
            severity: parsed.severity,
            step: 'awaiting_location',
            createdAt: new Date()
          });

          const typeInfo = INCIDENT_TYPES[parsed.type];
          const typeLabel = lang === 'fr' ? typeInfo.labelFr : (lang === 'pcm' ? typeInfo.labelPcm : typeInfo.labelEn);
          let msg = `${typeInfo.emoji} *${typeLabel}* detected!\n\n` +
            MESSAGES.shareLocation[lang];

          if (parsed.type === 'police_control') {
            msg += POLICE_DISCLAIMER[lang];
          }

          const locLabel = lang === 'pcm' ? '📍 Show weh I dey' : '📍 Partager Ma Position / Share My Location';
          return ctx.replyWithMarkdown(
            msg,
            this.getLocationKeyboard(lang, locLabel)
          );
        }

        // 5. Help fallback
        if (text.length < 50) {
          ctx.replyWithMarkdown(
            lang === 'fr'
              ? `🤖 *Besoin d'aide?* Utilisez les boutons ci-dessus ou envoyez un vocal pour signaler un incident.`
              : (lang === 'pcm' ? `🤖 *You de find help?* Use the buttons dem for up or send voice note make we report wahala.` : `🤖 *Need help?* Use the buttons above or send a voice note to report an incident.`)
          );
        }
      }
    });

    // Callback queries already handled above, deleting redundant block

    // Incident type selection
    Object.keys(INCIDENT_TYPES).forEach((type) => {
      this.bot.action(`type_${type}`, (ctx) => {
        this.handleIncidentTypeSelection(ctx, type as IncidentType);
      });
    });

    // SOS Final Confirmation
    this.bot.action('sos_confirm', (ctx) => {
      this.finalizeSOS(ctx);
    });

    // Admin Broadcast
    this.bot.action('admin_broadcast', async (ctx) => {
      const userId = ctx.from!.id.toString();
      if (!this.isAdmin(userId)) return ctx.answerCbQuery('❌ Access Denied');

      const lang = this.getLang(userId);
      ctx.answerCbQuery();
      ctx.reply(lang === 'fr' ? '📢 ENVOYEZ LE MESSAGE DE DIFFUSION (Texte):' : '📢 SEND THE BROADCAST MESSAGE (Text):');

      adminStates.set(userId, { step: 'broadcast_message' });
    });

    // Fuel Price Update Flow
    this.bot.action(/^update_fuel_(.+)$/, (ctx) => {
      const stationId = ctx.match[1];
      const lang = this.getLang(ctx.from!.id.toString());

      pendingFuel.set(ctx.from!.id.toString(), {
        step: 'awaiting_price',
        stationId
      });

      ctx.answerCbQuery();
      ctx.reply(lang === 'fr'
        ? '⛽ Quel carburant voulez-vous mettre à jour?'
        : (lang === 'pcm' ? '⛽ Which fuel price change?' : '⛽ Which fuel price do you want to update?'),
        Markup.inlineKeyboard([
          [Markup.button.callback('Super (Petrol)', `fuel_type_petrol`)],
          [Markup.button.callback('Gasoil (Diesel)', `fuel_type_diesel`)],
          [Markup.button.callback('Gaz (Gas)', `fuel_type_gas`)]
        ])
      );
    });

    this.bot.action(/^fuel_type_(.+)$/, (ctx) => {
      const type = ctx.match[1] as 'petrol' | 'diesel' | 'gas';
      const userId = ctx.from!.id.toString();
      const state = pendingFuel.get(userId);

      if (state && state.stationId) {
        state.fuelType = type;
        pendingFuel.set(userId, state);
        ctx.answerCbQuery();

        const lang = this.getLang(userId);
        const fuelName = type === 'petrol' ? 'Super' : (type === 'diesel' ? 'Gasoil' : 'Gaz');

        ctx.reply(lang === 'fr'
          ? `💰 Entrez le nouveau prix pour ${fuelName} (ex: 730):`
          : (lang === 'pcm' ? `💰 Enter the new money for ${fuelName} (ex: 730):` : `💰 Enter new price for ${fuelName} (e.g. 730):`));
      } else {
        ctx.answerCbQuery('❌ Session expired.');
      }
    });

    // Community verification — Confirm (with double-confirm prevention)
    this.bot.action(/^confirm_(.+)$/, async (ctx) => {
      ctx.answerCbQuery();
      const incidentId = ctx.match[1];
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);
            const success = await addConfirmation(incidentId, userId, 'confirm');
      ctx.reply(lang === 'fr'
        ? (success ? '✅ Incident confirmé. Merci!' : '⚠️ Vous avez déjà confirmé.')
        : (lang === 'pcm' ? (success ? '✅ You don confirm am. Thank you!' : '⚠️ You don confirm am before.') : (success ? '✅ Incident confirmed. Thank you!' : '⚠️ You have already confirmed.'))
      );
    });

    this.bot.action(/^reject_(.+)$/, async (ctx) => {
      ctx.answerCbQuery();
      const incidentId = ctx.match[1];
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);

      const success = await addConfirmation(incidentId, userId, 'deny');

      ctx.reply(lang === 'fr'
        ? (success ? '❌ Signalement rejeté. Merci.' : '⚠️ Action déjà enregistrée.')
        : (lang === 'pcm' ? (success ? '❌ You talk say na lie. Thank you.' : '⚠️ We don hear you before.') : (success ? '❌ Report rejected. Thank you.' : '⚠️ Action already recorded.'))
      );
    });

    // Tip pagination
    this.bot.action('next_tip', (ctx) => {
      ctx.answerCbQuery();
      const lang = this.getLang(ctx.from!.id.toString());
      const tip = DriverService.getSeasonalTip();
      ctx.editMessageText(
        lang === 'fr'
          ? `💡 *Conseil de Conduite:*\n\n${tip.fr}`
          : `💡 *Driving Tip:*\n\n${tip.en}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'fr' ? '🔄 Autre conseil' : '🔄 Another tip', 'next_tip')]
          ])
        }
      );
    });
  }

  // ========== INCIDENT FLOW HELPERS ==========

  private showIncidentTypeSelection(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const buttons = Object.entries(INCIDENT_TYPES).map(([key, value]) => {
      const label = lang === 'fr' ? value.labelFr : (lang === 'pcm' ? value.labelPcm : value.labelEn);
      return [Markup.button.callback(`${value.emoji} ${label}`, `type_${key}`)];
    });

    ctx.replyWithMarkdown(
      MESSAGES.selectType[lang],
      Markup.inlineKeyboard(buttons)
    );
  }

  private handleIncidentTypeSelection(ctx: Context, type: IncidentType) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);

    // Check if this type requires severity selection (like traffic, road_condition)
    // For MVP, we can skip severity or make it simple
    // Let's ask for description directly for speed

    pendingReports.set(userId, {
      userId,
      type,
      step: 'awaiting_description',
      createdAt: new Date()
    });

    // Use editMessageText to reduce clutter
    ctx.editMessageText(
      lang === 'fr'
        ? `📝 *Décrivez l'incident:*\n\n(Ex: "Gros trou à Carrefour Bastos", "Policiers au rond point")`
        : (lang === 'pcm' ? `📝 *Talk wetin happen:*\n\n(Ex: "Big hole for Bastos junction", "Police dey check point")` : `📝 *Describe the incident:*\n\n(Ex: "Big pothole at Bastos", "Police checkpoint")`),
      { parse_mode: 'Markdown' }
    );
  }

  private async handleLocation(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const pending = pendingReports.get(userId);
    const lang = this.getLang(userId);

    // If it's a broadcast message (Admin Flow)
    if (adminStates.get(userId)?.step === 'broadcast_message') {
      // Admin sent a location? Probably mistake, but handled in text
      return;
    }

    if (!pending || pending.step !== 'awaiting_location') {
      // Maybe user just shared location randomly -> Show nearby
      if (ctx.message && 'location' in ctx.message) {
        await this.showNearbyIncidents(ctx, ctx.message.location);
      }
      return;
    }

    if (!ctx.message || !('location' in ctx.message)) return;

    const location: Coordinates = {
      latitude: ctx.message.location.latitude,
      longitude: ctx.message.location.longitude
    };

    const incidentData: any = {
      type: pending.type,
      description: pending.description || '',
      location,
      severity: pending.severity || 3,
      status: 'pending',
      reporterId: userId,
      confirmations: 0,
      mediaUrl: pending.mediaUrl,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      createdAt: new Date()
    };

    // Save to Supabase
    const saved = await createIncident(incidentData);

    // Reward User
    await incrementUserReports(userId, true);

    // Notify User
    ctx.replyWithMarkdown(
      MESSAGES.reportReceived[lang],
      this.getPersistentKeyboard(lang)
    ); // Back to menu

    // Notify Channel (Broadcast)
    if (saved && this.channelId) {
      const isCritical = (saved.severity as number) >= 4;
      await this.sendToChannel(DriverService.formatIncidentMessage(saved, 'fr'), isCritical);
    }

    // Cleanup
    pendingReports.delete(userId);
  }

  // ========== VOICE HANDLER (Gemini 2.5) ==========
  private async handleVoice(ctx: Context) {
    try {
      const userId = ctx.from!.id.toString();
      const lang = this.getLang(userId);

      ctx.replyWithChatAction('typing');

      // 1. Get file link
      if (!ctx.message || !('voice' in ctx.message)) {
        throw new Error('No voice message found in context');
      }
      const fileId = ctx.message.voice.file_id;
      const link = await ctx.telegram.getFileLink(fileId);

      // 2. Process with Gemini (Audio -> Text -> Meaning)
    const analysis = await geminiClient.analyzeVoice(link.href);

      if (!analysis) throw new Error('Analysis returned null');

      // 3. Check for Autonomous Sensor Detection (Crash/Pothole)
      const isAutoDetect = analysis.sensorData?.potentialCrash || analysis.sensorData?.potholeHit;

      if (analysis.type !== 'other' || isAutoDetect) {
        const finalType = isAutoDetect
          ? (analysis.sensorData.potentialCrash ? 'accident' : 'road_damage')
          : analysis.type as IncidentType;

        pendingReports.set(userId, {
          userId,
          type: finalType,
          description: analysis.description || (isAutoDetect ? 'Auto-detected via OS Synergy analysis' : 'Voice report'),
          severity: isAutoDetect ? 4 : analysis.severity,
          step: 'awaiting_location',
          createdAt: new Date()
        });

        const typeInfo = INCIDENT_TYPES[finalType];
        const typeLabel = lang === 'fr' ? typeInfo.labelFr : (lang === 'pcm' ? typeInfo.labelPcm : typeInfo.labelEn);

        ctx.replyWithMarkdown(
          (isAutoDetect ? `🛰️ *OS SYNERGY DETECTED:* \n\n` : `🎙️ *Analyse Vocale Terminée:*\n\n`) +
          `⚠️ *Type:* ${typeInfo.emoji} ${typeLabel}\n` +
          `📝 *Note:* "${analysis.description || 'Ambient sound check'}"\n\n` +
          MESSAGES.shareLocation[lang],
          this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Valider ma Position' : '📍 Confirm Location')
        );
      } else {
        ctx.reply(lang === 'fr'
          ? '😕 Je n\'ai pas bien compris. Pouvez-vous répéter ou écrire?'
          : (lang === 'pcm' ? '😕 I no hear well. Abeg talk again or write am.' : '😕 I didn\'t catch that. Please repeat or type it.')
        );
      }
    } catch (err) {
      console.error('Voice analysis Error:', err);
      ctx.reply('❌ Analysis failed.');
    }
  }

  private async handlePhoto(ctx: Context) {
    // Similar to voice, but uses Gemini Vision
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);

    if (!ctx.message || !('photo' in ctx.message)) {
      return ctx.reply('❌ No photo found in message.');
    }
    const photo = ctx.message.photo.pop();
    if (!photo) return ctx.reply('❌ Photo data missing.');
    const link = await ctx.telegram.getFileLink(photo.file_id);

    ctx.replyWithChatAction('typing');
    const analysis = await geminiClient.analyzePhoto(link.href);

    if (analysis && analysis.type !== 'other') {
       pendingReports.set(userId, {
        userId,
        type: analysis.type as IncidentType,
        description: analysis.description,
        severity: (analysis.severity as any) as Severity,
        mediaUrl: link.href, // Save image link
        step: 'awaiting_location',
        createdAt: new Date()
      });

      const typeInfo = INCIDENT_TYPES[analysis.type];

      ctx.replyWithMarkdown(
        `📸 *Analyse Photo Terminée:*\n\n` +
        `⚠️ *Type:* ${typeInfo.emoji} ${analysis.type}\n` +
        `📝 *Note:* "${analysis.description}"\n\n` +
        MESSAGES.shareLocation[lang],
        this.getLocationKeyboard(lang, lang === 'fr' ? '📍 Valider ma Position' : '📍 Confirm Location')
      );
    }
  }

  // ========== UTILS ==========

  private async showActiveAlerts(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const incidents = await getActiveIncidents(4 * 60); // 4 hours validity

    if (incidents.length === 0) {
      return ctx.reply(lang === 'fr' ? '✅ Aucun incident majeur signalé récemment.' : '✅ No major incidents reported recently.');
    }

    // Show top 5 recent
    for (const inc of incidents.slice(0, 5)) {
      ctx.replyWithMarkdown(DriverService.formatIncidentMessage(inc, lang));
    }
  }

  private async showNearbyIncidents(ctx: Context, location: Coordinates) {
    const lang = this.getLang(ctx.from!.id.toString());
    const nearby = await getNearbyIncidents(location, 5); // 5km radius

    if (nearby.length === 0) {
      return ctx.reply(lang === 'fr' ? '✅ La voie est libre autour de vous (5km).' : '✅ Road is clear around you (5km).');
    }

    // Sort by distance
    const sorted = nearby.map(inc => ({
      ...inc,
      distance: GeoService.calculateDistance(location, inc.location)
    })).sort((a, b) => a.distance - b.distance);

    ctx.reply(lang === 'fr' ? `⚠️ *Incidents Proches (${nearby.length}):*` : `⚠️ *Nearby Incidents (${nearby.length}):*`);
    for (const inc of sorted) {
      const distStr = inc.distance < 1 ? `${(inc.distance * 1000).toFixed(0)}m` : `${inc.distance.toFixed(1)}km`;
      ctx.replyWithMarkdown(`📍 *${distStr}*: ` + DriverService.formatIncidentMessage(inc, lang));
    }
  }

  private async showLeaderboard(ctx: Context) {
    const stats = await getLeaderboard();
    const lang = this.getLang(ctx.from!.id.toString());
    let msg = MESSAGES.leaderboardHeader[lang];
    stats.forEach((s, i) => msg += `${i+1}. @${s.username || 'Anonyme'}: ${s.trustScore} pts\n`);
    ctx.replyWithMarkdown(msg);
  }

  private showTollsSelection(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    ctx.replyWithMarkdown(
      DriverService.formatAllTolls(lang),
      Markup.inlineKeyboard(
        CAMEROON_TOLL_ROUTES.map((r, i) => [
          Markup.button.callback(
            `📋 ${r.origin} → ${r.destination}`,
            `toll_${i}`
          )
        ])
      )
    );
  }

  private showDrivingTips(ctx: Context) {
    const lang = this.getLang(ctx.from!.id.toString());
    const tip = DriverService.getSeasonalTip();
    ctx.replyWithMarkdown(
      lang === 'fr'
        ? `💡 *Conseil de Conduite:*\n\n${tip.fr}`
        : `💡 *Driving Tip:*\n\n${tip.en}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'fr' ? '🔄 Autre conseil' : '🔄 Another tip', 'next_tip')]
      ])
    );
  }

  private async handlePanic(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    const user = await getOrCreateUser(userId, ctx.from!.username);

    // 1. Immediate acknowledgement
    ctx.reply(lang === 'fr' ? '🚨 *SOS REÇU!* Traitement en cours...' : '🚨 *SOS RECEIVED!* Processing...', { parse_mode: 'Markdown' });

    // 2. Notify Emergency Contacts (Mock)
    if (user?.emergencyContacts && user.emergencyContacts.length > 0) {
      user.emergencyContacts.forEach(contactId => {
        this.bot.telegram.sendMessage(contactId,
          `🚨 *ALERTE SOS DE @${ctx.from!.username}*\n\nL'utilisateur a déclenché un bouton panique à proximité de vous.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {}); // Ignore errors if contact blocked bot
      });
      console.log(`[SOS] Notified ${user.emergencyContacts.length} contacts for user ${userId}`);
    }

    // 3. Request precise location for intervention
    ctx.replyWithMarkdown(
      lang === 'fr'
        ? '📍 *URGENT:* Partagez votre position actuelle pour les secours!'
        : (lang === 'pcm' ? '📍 *QUICK:* Show weh you dey make help come!' : '📍 *URGENT:* Share your current location for help!'),
       this.getLocationKeyboard(lang, '🚨 SOS LOCATION')
    );

    // 4. Create Incident automatically
    pendingReports.set(userId, {
      userId,
      type: 'accident', // Default to highest severity type
      severity: 5,
      description: 'SOS PANIC BUTTON ACTIVATED',
      step: 'awaiting_location',
      createdAt: new Date()
    });
  }

  private async findFuel(ctx: Context, location: Coordinates) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);

    // Search within 5km
    const stations = await getNearbyFuel(location, 5);

    if (stations.length === 0) {
      return ctx.reply(lang === 'fr' ? '❌ Aucune station connue à proximité.' : (lang === 'pcm' ? '❌ No station dey near you o.' : '❌ No known stations nearby.'));
    }

    // Sort by distance using GeoService
    const sortedStations = stations
      .map(s => ({
        ...s,
        distance: GeoService.calculateDistance(location, { latitude: s.latitude, longitude: s.longitude })
      }))
      .sort((a, b) => a.distance - b.distance);

    let msg = lang === 'fr' ? '⛽ *Stations Service Proches:*\n\n' : (lang === 'pcm' ? '⛽ *Petrol Station dem near you:*\n\n' : '⛽ *Nearby Gas Stations:*\n\n');

    for (const s of sortedStations) {
      const distStr = s.distance < 1 ? `${(s.distance * 1000).toFixed(0)}m` : `${s.distance.toFixed(1)}km`;
      const lastUpdate = s.lastUpdated ? `🕒 ${Math.floor((Date.now() - s.lastUpdated.getTime())/60000)}m ago` : '';

      msg = `🏪 *${s.name}* (${distStr})\n`;
      if (s.petrolPrice) msg += `   ⛽ Super: *${s.petrolPrice}* FCFA\n`;
      if (s.dieselPrice) msg += `   🚚 Gasoil: *${s.dieselPrice}* FCFA\n`;
      if (s.gasPrice) msg += `   🔵 Gaz: *${s.gasPrice}* FCFA\n`;
      msg += `   ${lastUpdate}\n\n`;

      await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'fr' ? '💰 Mettre à jour les prix' : (lang === 'pcm' ? '💰 Update Price' : '💰 Update Prices'), `update_fuel_${s.id}`)]
      ]));
    }
  }

  private async handleRouteLocation(ctx: Context, req: { origin?: Coordinates; destination?: Coordinates; step: 'origin' | 'destination' }) {
    const userId = ctx.from!.id.toString();
    const lang = this.getLang(userId);
    if (!ctx.message || !('location' in ctx.message)) {
      return ctx.reply('❌ Location not found in message.');
    }
    const loc = { latitude: ctx.message.location.latitude, longitude: ctx.message.location.longitude };

    if (req.step === 'origin') {
      req.origin = loc;
      req.step = 'destination';
      pendingRoutes.set(userId, req);

      ctx.reply(
        lang === 'fr'
          ? '🏁 Bien. Maintenant partagez la POSITION de DESTINATION (ou tapez le nom):'
          : (lang === 'pcm' ? '🏁 Fine. Now show the PLACE weh you de GO:' : '🏁 Good. Now share the DESTINATION location (or type name):'),
        Markup.keyboard([
          [Markup.button.locationRequest(lang === 'fr' ? '📍 Ma Position' : '📍 Current Location')]
        ]).resize()
      );
    } else if (req.step === 'destination') {
      req.destination = loc;
      pendingRoutes.delete(userId); // Flow complete

      // Calculate Route
      ctx.replyWithChatAction('typing');

      try {
        const route: DirectionsResult | null = await DirectionsService.getDirections(req.origin!, loc);
        if (!route) throw new Error('Route not found');

        ctx.replyWithMarkdown(
          `🛣️ *Itinéraire AsTeck*\n\n` +
          `🏁 *De:* ${route.primary.startAddress}\n` +
          `📍 *À:* ${route.primary.endAddress}\n\n` +
          `📏 *Distance:* ${route.primary.distance}\n` +
          `⏱️ *Temps:* ${route.primary.duration}\n` +
          `Map summary: ${route.primary.summary}\n\n` +
          `🚦 *Condition:* ${route.primary.durationValue > 30 * 60 ? 'Heavy Traffic' : 'Normal'}\n\n` +
          `🛠️ *Étapes:*\n${route.primary.steps.join('\n')}`,
          this.getPersistentKeyboard(lang)
        );
      } catch (e) {
        ctx.reply('❌ Error calculating route.');
      }
    }
  }

  private finalizeSOS(ctx: Context) {
    // Already handled in handlePanic
  }

  public async sendToChannel(message: string, isCritical: boolean = false) {
    if (this.channelId) {
      const formattedMsg = isCritical ? `🚨🚨 *CRITICAL ALERT* 🚨🚨\n\n${message}` : message;
      // Use the internal bot instance to send
      const sent = await this.bot.telegram.sendMessage(this.channelId, formattedMsg, { parse_mode: 'Markdown' });
      
      if (isCritical) {
        try {
          await this.bot.telegram.pinChatMessage(this.channelId, sent.message_id);
        } catch (e) {
          console.warn('Could not pin message:', e);
        }
      }
    }
  }

  public launch() {
    this.bot.launch(() => {
      console.log('🤖 AsTeck Bot initialized with World-Class Architecture');
    });

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
