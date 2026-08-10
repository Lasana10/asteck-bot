/**
 * AFAT OS — Background Queue Service (BullMQ)
 * Handles asynchronous tasks like DriverDNA calculation and notifications.
 */

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { supabase } from '../infra/supabase';

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
    const { data: trip } = await supabase
      .from('bookings')
      .select('rating, feedback, route_id')
      .eq('id', tripId)
      .single();

    const { data: completedTrips } = await supabase
      .from('bookings')
      .select('id, rating')
      .eq('operator_id', driverId)
      .eq('status', 'completed');

    const completedCount = completedTrips?.length || 0;
    const ratedTrips = completedTrips?.filter((booking) => booking.rating !== null && booking.rating !== undefined) || [];
    if (completedCount < 10 || ratedTrips.length < 3) {
      console.log(`DriverDNA evidence pending for ${driverId}: ${completedCount} completed trips, ${ratedTrips.length} ratings.`);
      return {
        status: 'insufficient_evidence',
        completedTrips: completedCount,
        ratings: ratedTrips.length,
      };
    }

    const averageRating = ratedTrips.reduce((sum, booking) => sum + Number(booking.rating || 0), 0) / ratedTrips.length;
    const newScore = Math.round(Math.max(0, Math.min(100, 45 + averageRating * 9 + Math.min(10, completedCount / 5))));
    const tier = newScore >= 90 ? 'Diamond Sentinel' : newScore >= 80 ? 'Platinum' : newScore >= 60 ? 'Gold' : 'Verified';

    await supabase
      .from('profiles')
      .update({
        trust_score: newScore,
        driver_dna_tier: tier,
      })
      .eq('id', driverId);

    console.log(`✅ DriverDNA updated to ${newScore} (${tier}) from verified trip evidence. Last trip rating: ${trip?.rating ?? 'none'}`);
  } catch (error) {
    console.error(`❌ DriverDNA update failed for ${driverId}:`, error);
    throw error; // Let BullMQ retry
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`💥 Job ${job?.id} failed:`, err.message);
});

console.log('📡 Queue Worker Initialized: Listening for DriverDNA tasks.');
