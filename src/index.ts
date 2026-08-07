import express, { Request, Response } from 'express';
import { TelegramService } from './services/telegram';
import { scheduler } from './services/scheduler';
import apiRoutes from './api/routes';
import onboardingRoutes from './api/onboarding';
import placeIntelligenceRoutes from './api/placeIntelligence';
import dotenv from 'dotenv';
import cors from 'cors';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { CronService } from './services/CronJobs';
import { apiRateLimiter, requestLogger, sanitizeInput, securityHeaders } from './middleware/security';

dotenv.config();

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

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
const apiVersion = process.env.AFAT_API_VERSION || 'v1';
const buildVersion =
  process.env.RENDER_GIT_COMMIT ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  'local';
const requiredApiRoutes = [
  'POST /api/auth/supabase-profile',
  'POST /api/auth/qa-bypass',
  'POST /api/auth/send-otp',
  'POST /api/auth/verify-otp',
  'POST /api/onboard/passenger/register',
  'POST /api/onboard/driver/register',
  'POST /api/onboard/company/register',
  'GET /health',
  'GET /health/live',
  'GET /health/ready',
  'GET /health/contract',
];

app.disable('x-powered-by');

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLOUDFLARE_PREVIEW_URL,
  'https://asteck-bot.pages.dev',
  'https://c56d4984.asteck-bot.pages.dev',
  'https://asteck-bot.asanadaniel8.workers.dev',
  'https://dashboard.afat.cm',
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean) as string[];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.asteck-bot\.pages\.dev$/i.test(origin)) return callback(null, true);
    if (/^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/i.test(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by AFAT CORS policy'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(securityHeaders);
app.use(requestLogger);
app.use(sanitizeInput);
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
    const webhookDomain = process.env.WEBHOOK_DOMAIN || process.env.RENDER_EXTERNAL_URL;
    
    if (webhookDomain) {
      const webhookPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
      const webhookUrl = `${webhookDomain}${webhookPath}`;
      
      app.post(webhookPath, (req: Request, res: Response) => {
        const bot = telegramService.getBotInstance();
        bot.handleUpdate(req.body, res);
      });
      
      app.listen(port, async () => {
        console.log(`🚀 Server listening on port ${port}`);
        try {
          const bot = telegramService.getBotInstance();
          // FORCE DELETE old webhook to clear 409 Conflicts
          await bot.telegram.deleteWebhook({ drop_pending_updates: true });
          await bot.telegram.setWebhook(webhookUrl);
          console.log(`✅ Webhook synchronized: ${webhookUrl}`);
        } catch (err) {
          console.error('❌ Webhook Sync Failed:', err);
        }
      });
    } else {
      console.warn('⚠️ No WEBHOOK_DOMAIN found. Falling back to Polling...');
      app.listen(port, () => {
        console.log(`🚀 Server listening on port ${port} (Polling mode)`);
      });
      // Force delete webhook before polling
      const bot = telegramService.getBotInstance();
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
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
  const missing: string[] = [];
  if (!process.env.TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_KEY) missing.push('SUPABASE_SECRET_KEY or SUPABASE_KEY');
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Initialize Agentic Cron Jobs
  CronService.init();

  // Health Check endpoints
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'AFAT',
      version: apiVersion,
      build: buildVersion,
      api_mount: '/api',
      contract: '/health/contract',
    });
  });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status: 'live',
      service: 'AFAT',
      build: buildVersion,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      const { error } = await import('./infra/supabase').then(({ supabase }) =>
        supabase.from('profiles').select('id', { count: 'exact', head: true }).limit(1)
      );
      if (error) throw error;
      res.status(200).json({
        status: 'ready',
        service: 'AFAT',
        dependencies: {
          database: 'ready',
        },
        build: buildVersion,
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'degraded',
        service: 'AFAT',
        dependencies: {
          database: 'unavailable',
        },
        error: error?.message || 'Readiness check failed',
        build: buildVersion,
      });
    }
  });

  app.get('/health/contract', (_req, res) => {
    res.status(200).json({
      status: 'contract_ready',
      service: 'AFAT',
      version: apiVersion,
      api_mount: '/api',
      build: buildVersion,
      required_routes: requiredApiRoutes,
      auth_contract: {
        session_authority: 'supabase_jwt',
        profile_bootstrap: 'POST /api/auth/supabase-profile',
        public_qa_bypass: process.env.AFAT_ALLOW_QA_BYPASS === 'true' ? 'enabled' : 'disabled_or_local_only',
      },
    });
  });

  app.get('/', (req, res) => {
    res.send('AFAT World-Class Traffic Intelligence is Running.');
  });

  app.use('/api', apiRoutes);
  app.use('/api/onboard', onboardingRoutes);
  app.use('/api', placeIntelligenceRoutes);
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'AFAT API route not found',
      method: req.method,
      path: req.originalUrl,
    });
  });
  app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const isApiRequest = req.originalUrl.startsWith('/api');
    console.error('AFAT request error:', err);
    res.status(isApiRequest ? 500 : 400).json({
      error: isApiRequest ? 'AFAT API request failed' : 'Request rejected',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  });

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
