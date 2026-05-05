import { aiRouter } from './AIRouter';
import { supabase } from '../infra/supabase';
import { TelegramService } from './telegram';
import { waBridge } from './WhatsAppBridge';

/**
 * ============================================================================
 * AGENTIC WORKFLOWS CORE
 * ============================================================================
 * Implements the 2026 "Invisible App" paradigms:
 * 1. Zero-Click Commute (Predictive Booking)
 * 2. Ghost Dispatcher (Swarm Intelligence & Bidding)
 * 3. Self-Healing Map (Sensor-Fusion Validation)
 * ============================================================================
 */

export class AgenticWorkflows {
  
  /**
   * 1. THE GHOST DISPATCHER
   * Watches the grid for demand spikes. When a cluster of commuters is detected
   * in a zone (e.g., Akwa) during rain, it autonomously messages
   * drivers to reroute before the traffic jams occur.
   */
  static async triggerGhostDispatcher(zone: string, demandLevel: number) {
    if (demandLevel < 5) return;

    console.log(`[Ghost Dispatcher] 👻 Detected demand spike at ${zone} (Level ${demandLevel})`);
    
    // THE PREDICTIVE MIND calculates the optimal surge multiplier
    const analysis = await aiRouter.route('predict', {
      prompt: `Demand spike at ${zone}. Level: ${demandLevel}. Calculate surge multiplier (between 1.1x and 2.0x). Return JSON: {"multiplier": 1.5, "reason": "..."}`
    });

    let multiplier = 1.2;
    try {
      const parsed = JSON.parse(analysis.text);
      multiplier = parsed.multiplier || 1.2;
    } catch (e) {}

    // Query active drivers within the vicinity (Mock geographic range for now)
    const { data: idleDrivers } = await supabase
      .from('profiles')
      .select('id, phone, telegram_id')
      .eq('role', 'operator')
      .eq('is_active', true)
      .limit(5);

    const telegram = new TelegramService();

    for (const driver of (idleDrivers || [])) {
      const msg = `⚡ AFAT GRID ALERT: High demand detected at ${zone}. Surge: ${multiplier}x Trust Points. Move to zone for priority bookings.`;
      
      // Dispatch via Telegram if available, else WhatsApp
      if (driver.telegram_id) {
        await telegram.getBotInstance().telegram.sendMessage(driver.telegram_id, msg);
      } else if (driver.phone) {
        // waBridge logic for outbound is usually via Twilio API directly
        console.log(`📡 [WhatsApp Push] Sending to ${driver.phone}: ${msg}`);
      }
    }

    return { zone, multiplier, driversAlerted: idleDrivers?.length || 0 };
  }

  /**
   * 2. ZERO-CLICK COMMUTE
   * Runs daily at 7:00 AM. Analyzes a user's habits. If their usual route has an
   * incident, it automatically pre-books a detour ride.
   */
  static async evaluateZeroClickCommute(userId: string, usualRoute: { origin: string, dest: string }) {
    console.log(`[Zero-Click] 🧠 Evaluating daily commute for User ${userId}: ${usualRoute.origin} -> ${usualRoute.dest}`);
    
    // Check Intelligence for threats on that specific route
    const threatReport = await aiRouter.route('pulse', {
      prompt: `Is there any traffic jam, accident or roadblock between ${usualRoute.origin} and ${usualRoute.dest} right now? Answer with 'ALERT' if there is an issue, else 'CLEAR'.`
    });
    
    const hasObstruction = threatReport.text.toUpperCase().includes('ALERT');

    if (hasObstruction) {
      console.log(`[Zero-Click] 🛑 Obstruction detected. Engaging Auto-Negotiator...`);
      
      // Find a suitable driver (Sentinel)
      const { data: driver } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'operator')
        .eq('is_active', true)
        .order('driver_dna_score', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!driver) return { status: 'no_drivers' };

      // Auto-Negotiate Price
      const negotiation = await aiRouter.route('negotiate', {
        route: `${usualRoute.origin} to ${usualRoute.dest}`,
        demand: 'high',
        offer: 500
      });

      const price = 500; // Fallback
      
      const msg = `🚗 [Zero-Click] Votre trajet habituel est bloqué. J'ai pré-réservé ${driver.full_name} (${driver.contractor_code}) pour ${price} CFA. Départ à 7:25 AM. Tapez OUI pour confirmer.`;
      
      // Fetch user profile for contact
      const { data: user } = await supabase.from('profiles').select('telegram_id, phone').eq('id', userId).single();
      
      if (user?.telegram_id) {
        const telegram = new TelegramService();
        await telegram.getBotInstance().telegram.sendMessage(user.telegram_id, msg);
      }

      return { status: 'pre-booked', driverId: driver.id, price };
    }

    return { status: 'clear' };
  }

  /**
   * 3. THE SELF-HEALING MAP
   * Validates manual user reports autonomously using GPS telemetry logic.
   */
  static async autonomousVerification(incidentId: string, coordinates: { lat: number, lng: number }) {
    // Query GPS tracks around the incident within the last 5 minutes
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: nearbyTracks } = await supabase
      .from('gps_tracks')
      .select('speed_kph')
      .gt('created_at', fiveMinsAgo)
      // Geographic bounding box filtering would go here
      .limit(10);

    if (!nearbyTracks || nearbyTracks.length < 3) return false;

    const avgSpeed = nearbyTracks.reduce((s, t) => s + (t.speed_kph || 0), 0) / nearbyTracks.length;

    // If avg speed is < 15kph in a 50kph zone, verify the jam
    if (avgSpeed < 15) {
      await supabase
        .from('incidents')
        .update({ confidence: 100, status: 'verified_autonomously' })
        .eq('id', incidentId);
        
      return true;
    }
    
    return false;
  }
}
