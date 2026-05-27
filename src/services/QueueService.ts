/**
 * AFAT OS — Background Queue Service (BullMQ)
 * Handles asynchronous tasks like DriverDNA calculation and notifications.
 */

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { aiRouter } from './AIRouter';
import { supabase } from '../infra/supabase';
import { extractFirstJsonObject } from './aiParsing';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null
});

// ── 1. DRIVER DNA QUEUE ───────────────────────────────────────
export const dnaQueue = new Queue('driver-dna', { connection });

// ── 2. WORKER LOGIC ───────────────────────────────────────────
const worker = new Worker('driver-dna', async (job: Job) => {
  const { driverId, tripId } = job.data;
  console.log(`🧬 Processing DriverDNA for ${driverId} (Trip: ${tripId})...`);

  try {
    // 1. Fetch trip data and driver stats
    const { data: profile } = await supabase
      .from('profiles')
      .select('reports_count, accurate_reports, trust_score')
      .eq('id', driverId)
      .single();

    const { data: trip } = await supabase
      .from('bookings')
      .select('rating, feedback, route_id')
      .eq('id', tripId)
      .single();

    // 2. Use THE PREDICTIVE MIND to calculate new score
    const analysis = await aiRouter.predict(
      `Calculate DriverDNA update.
       Current Score: ${profile?.trust_score || 75}
       Trip Rating: ${trip?.rating || 5}
       Feedback: "${trip?.feedback || 'None'}"
       Accurate Reports: ${profile?.accurate_reports || 0}/${profile?.reports_count || 0}
       
       Output JSON { new_score, tier, reasoning }.`
    );

    const result = extractFirstJsonObject(analysis.text);
    if (!result) {
      throw new Error(`AI response was not valid JSON: ${analysis.text.substring(0, 120)}`);
    }

    // 3. Update profile
    await supabase
      .from('profiles')
      .update({
        trust_score: result.new_score,
        driver_dna_tier: result.tier
      })
      .eq('id', driverId);

    console.log(`✅ DriverDNA updated to ${result.new_score} (${result.tier})`);
  } catch (error) {
    console.error(`❌ DriverDNA update failed for ${driverId}:`, error);
    throw error; // Let BullMQ retry
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`💥 Job ${job?.id} failed:`, err.message);
});

console.log('📡 Queue Worker Initialized: Listening for DriverDNA tasks.');
