import express, { Request, Response } from 'express';
import { TelegramService } from './services/telegram';
import { scheduler } from './services/scheduler';
import apiRoutes from './api/routes';
import dotenv from 'dotenv';

dotenv.config();

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚦  ASTECK - World-Class Traffic Intelligence  🚦       ║
║                                                           ║
║   The definitive community-driven platform                ║
║   for road safety and driver intelligence in Cameroon.    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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
    const telegramService = new TelegramService();
    console.log('📡 Telegram Service Initialized. Handlers registered.');

    // Start Scheduler
    scheduler.start(async (msg) => {
      console.log('⏰ Scheduler triggered morning brief...');
      await telegramService.sendToChannel(msg);
    });

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
    if (webhookDomain) {
      const webhookPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
      const webhookUrl = `${webhookDomain}${webhookPath}`;
      app.use(webhookPath, telegramService.getWebhookCallback());
      
      app.listen(port, async () => {
        console.log(`🚀 Server listening on port ${port}`);
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
      // CRITICAL: Open port FIRST so Render detects it, THEN start polling
      app.listen(port, () => {
        console.log(`🚀 Server listening on port ${port} (Polling mode)`);
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
}

main();
