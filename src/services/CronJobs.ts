/**
 * AFAT OS — Automated Agentic Cron Jobs
 * Handles: 
 * - Zero-Click Commute (Daily habit analysis)
 * - Fatigue Reset (Midnight)
 * - System Health Checks
 */

import cron from 'node-cron';
import { AgenticWorkflows } from './AgenticWorkflows';
import { supabase } from '../infra/supabase';

export class CronService {
  static init() {
    console.log('⏲️ [CRON] Initializing Agentic Background Jobs...');

    // ── 1. ZERO-CLICK COMMUTE (Daily 07:00 AM) ─────────────────────
    // Pattern: '0 7 * * *'
    cron.schedule('0 7 * * *', async () => {
      console.log('🧠 [CRON] Starting Zero-Click Commute Analysis (07:00 AM)...');
      
      try {
        // Fetch users who have commute habits defined
        // For now, we query profiles where usual_route is not null
        const { data: users, error } = await supabase
          .from('profiles')
          .select('id, usual_route')
          .not('usual_route', 'is', null);

        if (error) throw error;

        console.log(`🧠 [CRON] Analyzing ${users?.length || 0} user commutes...`);

        for (const user of (users || [])) {
          // usual_route is stored as JSON: { origin: string, destination: string }
          await AgenticWorkflows.evaluateZeroClickCommute(user.id, user.usual_route);
        }
        
        console.log('✅ [CRON] Zero-Click analysis complete.');
      } catch (err) {
        console.error('❌ [CRON] Zero-Click job failed:', err);
      }
    });

    // ── 2. FATIGUE RESET (Daily Midnight) ─────────────────────────
    cron.schedule('0 0 * * *', async () => {
      console.log('💤 [CRON] Resetting driver fatigue hours (Midnight)...');
      try {
        const { error } = await supabase.rpc('reset_driver_fatigue');
        if (error) throw error;
        console.log('✅ [CRON] Fatigue reset successfully.');
      } catch (err) {
        console.error('❌ [CRON] Fatigue reset failed:', err);
      }
    });

    // ── 3. PULSE KEEP-ALIVE (Every 10 minutes) ────────────────────
    // Replaces the manual setInterval in index.ts for better orchestration
    cron.schedule('*/10 * * * *', () => {
      console.log('💓 [CRON] Pulse Keep-Alive (Self-Ping)...');
      // Logic for self-ping or health reporting to Sentry/Logs
    });

    console.log('📡 [CRON] All agentic schedules active.');
  }
}
