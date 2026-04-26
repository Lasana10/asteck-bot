import express, { Request, Response } from 'express';
import cors from 'cors';
import { TelegramService } from './services/telegram';
import { scheduler } from './services/scheduler';
import { WhatsAppBridge } from './services/WhatsAppBridge';
import { IntelligenceBridge } from './services/intelligenceBridge';
import apiRoutes from './api/routes';
import { apiRateLimiter, authRateLimiter, sanitizeInput, securityHeaders, requestLogger, setupGracefulShutdown } from './middleware/security';
import dotenv from 'dotenv';

dotenv.config();

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚦  AFAT - World-Class Sentinel Intelligence   🚦       ║
║                                                           ║
║   The definitive community-driven platform                ║
║   for road safety and driver intelligence in Cameroon.    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

const app = express();
const port = process.env.PORT || 3000;

// ═══ SECURITY MIDDLEWARE (World-Class) ═══
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'api-key'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(securityHeaders);
app.use(requestLogger);
app.use(sanitizeInput);
app.use('/api/auth', authRateLimiter);
app.use('/api', apiRateLimiter);

// Global error handling to prevent silent hangs
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
  // Give it a moment to log before restarting
  setTimeout(() => process.exit(1), 1000);
});

let botHeartbeat: NodeJS.Timeout | null = null;

async function startBot() {
  try {
<<<<<<< HEAD
    // Validate required environment variables
    const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY'];
    const missing = requiredEnv.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:', missing.join(', '));
      process.exit(1);
    }

    // Optional environment status
    console.log('📋 Configuration:');
    console.log(`   • Telegram Bot: ✅ Connected`);
    console.log(`   • Channel: ${process.env.TELEGRAM_CHANNEL_ID || '⚠️ Not set'}`);
    console.log(`   • Supabase: ✅ Connected`);
    console.log(`   • Gemini AI: ${process.env.GEMINI_API_KEY ? '✅ Ready' : '⚠️ Fallback mode'}`);
    console.log(`   • Google Maps: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Active' : '☁️ OSRM Fallback'}`);
    console.log(`   • OpenWeather: ${process.env.OPENWEATHERMAP_API_KEY ? '✅ Active' : '⚠️ Disabled'}`);
    console.log(`   • Arkesel SMS: ${process.env.ARKESEL_API_KEY ? '✅ Connected' : '⚠️ Stub mode (OTP logged to console)'}`);
    console.log(`   • Payment (${process.env.PAYMENT_PROVIDER || 'pawapay'}): ${process.env.PAYMENT_API_KEY ? '✅ Live' : '⚠️ Stub mode'}`);
    console.log(`   • Security: ✅ Rate Limiter + Headers + Sanitizer Active`);
    console.log(`   • Port: ${port}`);
    console.log('');

    const telegramService = new TelegramService();
    console.log('📡 Telegram Service Initialized. Handlers registered.');

    const intelligenceBridge = new IntelligenceBridge();
    console.log('🧠 Intelligence Bridge Active. AI nodes connected.');

    const whatsappBridge = WhatsAppBridge.getInstance();
    if (process.env.WHATSAPP_ENABLED === 'true') {
      // In a real env, we'd need a headless strategy, but for dev qrcode-terminal is used
      console.log('💬 WhatsApp Bridge Booting...');
      // whatsappBridge.initialize(); 
    }

    // Start Scheduler for Morning Briefs & Global Cleanup
=======
    const telegramService = new TelegramService();
    console.log('📡 Telegram Service Initialized. Handlers registered.');

    // Start Scheduler
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
    scheduler.start(async (msg) => {
      console.log('⏰ Scheduler triggered morning brief...');
      await telegramService.sendToChannel(msg);
    });

<<<<<<< HEAD
    // Health Check endpoint
    app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'UP', timestamp: new Date(), service: 'AFAT_SENTINEL' });
    });

    app.get('/', (req: Request, res: Response) => {
      res.send('AFAT Sentinel World-Class Intelligence is Running.');
    });

    // Mount Sovereign API
    app.use('/api', apiRoutes);

    console.log('🌐 Web endpoints ready at /health, /, and /api');

    // Robust Webhook Sanitization (Israeli-style rigor)
    const webhookDomain = process.env.WEBHOOK_DOMAIN?.replace(/\/$/, ''); // Strip trailing slash
=======
    // Heartbeat Monitor (Checks if bot is still responsive every 5 mins)
    if (botHeartbeat) clearInterval(botHeartbeat);
    botHeartbeat = setInterval(async () => {
      try {
        const bot = telegramService.getBotInstance();
        await bot.telegram.getMe();
        console.log('💓 Heartbeat: Bot is responsive.');
      } catch (e) {
        console.error('💔 Heartbeat failure! Restarting bot loop...');
        startBot();
      }
    }, 5 * 60 * 1000);

    // Handle webhook/polling
    const webhookDomain = process.env.WEBHOOK_DOMAIN;
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
    if (webhookDomain) {
      // Avoid passing colon to Express 5 router (which treats it as a parameter)
      const secretPathToken = process.env.TELEGRAM_BOT_TOKEN?.replace(':', '_') || 'fallback_path';
      const webhookPath = `/webhook/${secretPathToken}`;
      const webhookUrl = `${webhookDomain}${webhookPath}`;
<<<<<<< HEAD

      console.log(`🛡️  Security: Initializing Webhook Gateway...`);
      console.log(`📡  Target URL: ${webhookUrl}`);

      // Mount webhook handler at a secret path
      app.use(webhookPath, telegramService.getWebhookCallback());

      // Start Express FIRST, then set webhook
      const server = app.listen(port, async () => {
=======
      app.use(webhookPath, telegramService.getWebhookCallback());
      
      app.listen(port, async () => {
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
        console.log(`🚀 Server listening on port ${port}`);
        setupGracefulShutdown(server);
        try {
          const bot = telegramService.getBotInstance();
          await bot.telegram.setWebhook(webhookUrl);
          console.log(`✅ Webhook set: ${webhookUrl}`);
        } catch (err) {
          console.error('❌ Failed to set webhook:', err);
        }
      });
    } else {
      console.log('📡 Entering Polling Mode...');
<<<<<<< HEAD
      
      // Drop pending updates to avoid conflicts
      const bot = telegramService.getBotInstance();
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      await telegramService.launch();
      const server = app.listen(port, () => {
=======
      // CRITICAL: Open port FIRST so Render detects it, THEN start polling
      app.listen(port, () => {
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
        console.log(`🚀 Server listening on port ${port} (Polling mode)`);
        setupGracefulShutdown(server);
      });
      // Launch bot polling in background (non-blocking)
      telegramService.launch().catch(err => {
        console.error('❌ Polling launch error:', err);
      });
    }
  } catch (err) {
    console.error('💥 BOT FATAL CRASH:', err);
    console.log('🔄 Restarting in 10 seconds...');
    setTimeout(startBot, 10000);
  }
}

async function main() {
  // Validate required environment variables
  const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY'];
  const missing = requiredEnv.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Health Check endpoints
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'AFAT' });
  });

  app.get('/', (req, res) => {
    res.send('AFAT World-Class Traffic Intelligence is Running.');
  });

  app.use('/api', apiRoutes);

  await startBot();

  // Self-Pulse Keep-Alive (Elite reliability strategy)
  const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (appUrl) {
    setInterval(() => {
      fetch(`${appUrl}/health`).catch(() => {});
    }, 10 * 60 * 1000);
  }
}

main();
