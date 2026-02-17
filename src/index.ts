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

async function main() {
  try {
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
    console.log(`   • Port: ${port}`);
    console.log('');

    const telegramService = new TelegramService();
    console.log('📡 Telegram Service Initialized. Handlers registered.');

    // Start Scheduler for Morning Briefs & Global Cleanup
    scheduler.start(async (msg) => {
      console.log('⏰ Scheduler triggered morning brief...');
      await telegramService.sendToChannel(msg);
    });

    // Health Check endpoint
    app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'UP', timestamp: new Date(), service: 'ASTECK' });
    });

    app.get('/', (req: Request, res: Response) => {
      res.send('AsTeck World-Class Traffic Intelligence is Running.');
    });

    // Mount Sovereign API
    app.use('/api', apiRoutes);

    console.log('🌐 Web endpoints ready at /health, /, and /api');

    // Handle webhook if WEBHOOK_DOMAIN is set
    const webhookDomain = process.env.WEBHOOK_DOMAIN;
    if (webhookDomain) {
      const webhookPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
      const webhookUrl = `${webhookDomain}${webhookPath}`;

      // Mount webhook handler at a secret path
      app.use(webhookPath, telegramService.getWebhookCallback());

      // Start Express FIRST, then set webhook
      app.listen(port, async () => {
        console.log(`🚀 Server listening on port ${port}`);
        try {
          // Tell Telegram where to send updates
          const bot = telegramService.getBotInstance();
          await bot.telegram.setWebhook(webhookUrl);
          console.log(`✅ Webhook set: ${webhookUrl}`);
        } catch (err) {
          console.error('❌ Failed to set webhook:', err);
        }
      });
    } else {
      // Polling mode (local dev)
      console.log('📡 Entering Polling Mode...');
      
      // Drop pending updates to avoid conflicts
      const bot = telegramService.getBotInstance();
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      await telegramService.launch();
      app.listen(port, () => {
        console.log(`🚀 Server listening on port ${port} (Polling mode)`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to start AsTeck:', error);
    process.exit(1);
  }
}

main();
