/**
 * AFAT OS — Onboarding & Registration System
 * Handles: Driver registration, Vehicle registration, Passenger registration
 * Contractor agreements, Commission percentages, Fatigue tracking
 */

import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { aiRouter } from '../services/AIRouter';

const router = express.Router();

// ── DRIVER ONBOARDING ────────────────────────────────────────────────────────
router.post('/driver/register', async (req: Request, res: Response) => {
  try {
    const {
      full_name, phone, national_id, license_number,
      vehicle_type, vehicle_plate, vehicle_capacity,
      operator_id, // optional — if affiliated with an agence
      selfie_base64 // for ID verification
    } = req.body;

    if (!full_name || !phone || !national_id || !license_number) {
      return res.status(400).json({ error: 'Missing required fields: full_name, phone, national_id, license_number' });
    }

    // Check if already registered
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Driver already registered with this phone number' });
    }

    // AI verification of documents if selfie provided
    let verificationStatus = 'pending';
    if (selfie_base64) {
      try {
        const result = await aiRouter.analyzeImage(selfie_base64,
          'Verify this is a real person selfie for driver registration. Check for: clear face visible, no masks, good lighting. Return JSON: { verified: boolean, confidence: number, issues: [] }'
        );
        const parsed = JSON.parse(result.text);
        verificationStatus = parsed.verified ? 'verified' : 'needs_review';
      } catch {
        verificationStatus = 'pending'; // Manual review fallback
      }
    }

    // Generate contractor code
    const contractorCode = `AFAT-D-${Date.now().toString(36).toUpperCase()}`;

    // Create driver profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        full_name,
        phone,
        role: 'operator',
        national_id_number: national_id,
        license_number,
        contractor_code: contractorCode,
        verification_status: verificationStatus,
        driver_dna_score: 75.0, // Start at neutral
        driver_dna_tier: 'Recruit',
        commission_rate: 0.08, // 8% default platform fee
        fatigue_hours_today: 0,
        max_daily_hours: 12,
        operator_id: operator_id || null,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Register vehicle if provided
    let vehicle = null;
    if (vehicle_plate && vehicle_type) {
      const { data: v } = await supabase
        .from('vehicles')
        .insert({
          operator_id: profile.id,
          plate_number: vehicle_plate,
          vehicle_type,
          capacity: vehicle_capacity || 4,
          status: 'inactive',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      vehicle = v;
    }

    res.status(201).json({
      success: true,
      driver: {
        id: profile.id,
        contractor_code: contractorCode,
        verification_status: verificationStatus,
        commission_rate: '8%',
        vehicle
      },
      message: `Bienvenue ${full_name}! Code contractant: ${contractorCode}. Commission AFAT: 8%.`
    });
  } catch (error: any) {
    console.error('Driver registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// ── VEHICLE REGISTRATION ─────────────────────────────────────────────────────
router.post('/vehicle/register', async (req: Request, res: Response) => {
  try {
    const { driver_id, plate_number, vehicle_type, capacity, brand, model, year, color } = req.body;

    if (!driver_id || !plate_number || !vehicle_type) {
      return res.status(400).json({ error: 'Missing: driver_id, plate_number, vehicle_type' });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        operator_id: driver_id,
        plate_number,
        vehicle_type,
        capacity: capacity || 4,
        brand: brand || null,
        model: model || null,
        year: year || null,
        color: color || null,
        status: 'inactive',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, vehicle: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Vehicle registration failed' });
  }
});

// ── PASSENGER REGISTRATION ───────────────────────────────────────────────────
router.post('/passenger/register', async (req: Request, res: Response) => {
  try {
    const { full_name, phone, emergency_contact } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ error: 'Missing: full_name, phone' });
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'User already registered' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        full_name,
        phone,
        role: 'commuter',
        emergency_contact: emergency_contact || null,
        trust_points: 50,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, user: { id: data.id, full_name } });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// ── CLIENT FARE POSTING (Passengers post their prices) ───────────────────────
router.post('/fare/post', async (req: Request, res: Response) => {
  try {
    const { passenger_id, origin, destination, proposed_price, vehicle_type, departure_time, notes } = req.body;

    if (!passenger_id || !origin || !destination || !proposed_price) {
      return res.status(400).json({ error: 'Missing: passenger_id, origin, destination, proposed_price' });
    }

    // Generate a meeting code for the checkpoint
    const meetingCode = `M-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data, error } = await supabase
      .from('fare_requests')
      .insert({
        passenger_id,
        origin,
        destination,
        proposed_price,
        vehicle_type: vehicle_type || 'any',
        departure_time: departure_time || null,
        meeting_code: meetingCode,
        status: 'open', // open | matched | negotiating | confirmed | expired
        notes: notes || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2h expiry
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      fare_request: data,
      meeting_code: meetingCode,
      message: `Fare posted: ${origin} → ${destination} at ${proposed_price} XAF. Meeting code: ${meetingCode}. Drivers will be notified.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Fare posting failed' });
  }
});

// ── DRIVERS BROWSE OPEN FARES ────────────────────────────────────────────────
router.get('/fare/browse', async (req: Request, res: Response) => {
  try {
    const { origin, destination, vehicle_type } = req.query;

    let query = supabase
      .from('fare_requests')
      .select('*, profiles:passenger_id(full_name, trust_points)')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('proposed_price', { ascending: false }) // Highest price first for drivers
      .limit(20);

    if (origin) query = query.ilike('origin', `%${origin}%`);
    if (destination) query = query.ilike('destination', `%${destination}%`);
    if (vehicle_type) query = query.eq('vehicle_type', vehicle_type);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ fares: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to browse fares' });
  }
});

// ── DRIVER ACCEPTS / NEGOTIATES FARE ─────────────────────────────────────────
router.post('/fare/respond', async (req: Request, res: Response) => {
  try {
    const { fare_id, driver_id, action, counter_price } = req.body;
    // action: 'accept' | 'counter' | 'reject'

    if (!fare_id || !driver_id || !action) {
      return res.status(400).json({ error: 'Missing: fare_id, driver_id, action' });
    }

    if (action === 'accept') {
      // Direct accept — create booking
      const { data: fare } = await supabase
        .from('fare_requests')
        .select('*')
        .eq('id', fare_id)
        .single();

      if (!fare || fare.status !== 'open') {
        return res.status(400).json({ error: 'Fare no longer available' });
      }

      // Update fare status
      await supabase.from('fare_requests').update({ status: 'confirmed', matched_driver_id: driver_id }).eq('id', fare_id);

      res.status(200).json({
        success: true,
        status: 'confirmed',
        meeting_code: fare.meeting_code,
        message: `Confirmed! Meet passenger at checkpoint. Code: ${fare.meeting_code}`
      });

    } else if (action === 'counter') {
      // Insert negotiation entry
      await supabase.from('negotiations').insert({
        booking_id: fare_id,
        role: 'operator',
        price: counter_price,
        status: 'pending'
      });

      await supabase.from('fare_requests').update({ status: 'negotiating' }).eq('id', fare_id);

      res.status(200).json({
        success: true,
        status: 'negotiating',
        counter_price,
        message: `Counter offer of ${counter_price} XAF sent to passenger.`
      });

    } else {
      res.status(200).json({ success: true, status: 'rejected' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to respond to fare' });
  }
});

// ── DRIVER POSTS AVAILABILITY/PRICE ──────────────────────────────────────────
router.post('/fare/driver-post', async (req: Request, res: Response) => {
  try {
    const { driver_id, origin, destination, price, vehicle_type, departure_time } = req.body;

    if (!driver_id || !origin || !destination || !price) {
      return res.status(400).json({ error: 'Missing: driver_id, origin, destination, price' });
    }

    const { data, error } = await supabase
      .from('driver_offers')
      .insert({
        driver_id,
        origin,
        destination,
        price,
        vehicle_type: vehicle_type || 'any',
        departure_time: departure_time || null,
        status: 'active',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4h expiry
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      offer: data,
      message: `Offer posted: ${origin} → ${destination} at ${price} XAF. Passengers can now book you.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Driver offer posting failed' });
  }
});

// ── MARKET INTELLIGENCE (Get Average & Suggested Price) ──────────────────────
router.get('/fare/market-stats', async (req: Request, res: Response) => {
  try {
    const { origin, destination } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination required' });
    }

    // Fetch recent successful fares for this route
    const { data: fares } = await supabase
      .from('fare_requests')
      .select('proposed_price')
      .eq('origin', origin)
      .eq('destination', destination)
      .eq('status', 'confirmed')
      .limit(50);

    const prices = (fares || []).map(f => f.proposed_price);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    
    // AI Suggestion based on market pulse
    const aiSuggestion = await aiRouter.route('negotiate', {
      route: `${origin} to ${destination}`,
      distance: 10, // Mock distance
      demand: 'normal',
      offer: avgPrice || 500
    });

    const parsedAi = JSON.parse(aiSuggestion.text);

    res.status(200).json({
      route: { origin, destination },
      average_price: avgPrice,
      sample_size: prices.length,
      market_price: parsedAi.suggested_price || avgPrice || 500,
      ai_reasoning: parsedAi.reasoning || 'Based on historical corridor data.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Market stats failed' });
  }
});

// ── FATIGUE CHECK ────────────────────────────────────────────────────────────
router.get('/driver/fatigue/:driver_id', async (req: Request, res: Response) => {
  try {
    const { driver_id } = req.params;

    const { data: profile } = await supabase
      .from('profiles')
      .select('fatigue_hours_today, max_daily_hours, full_name')
      .eq('id', driver_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    const hoursWorked = profile.fatigue_hours_today || 0;
    const maxHours = profile.max_daily_hours || 12;
    const fatigueLevel = hoursWorked / maxHours;

    let status: 'green' | 'yellow' | 'red' = 'green';
    let message = 'Conducteur en forme. Bonne route!';

    if (fatigueLevel >= 0.85) {
      status = 'red';
      message = `⛔ FATIGUE CRITIQUE: ${hoursWorked}h/${maxHours}h. Arrêtez-vous immédiatement.`;
    } else if (fatigueLevel >= 0.65) {
      status = 'yellow';
      message = `⚠️ Attention fatigue: ${hoursWorked}h/${maxHours}h. Pause recommandée.`;
    }

    res.status(200).json({
      driver: profile.full_name,
      hours_worked: hoursWorked,
      max_hours: maxHours,
      fatigue_percentage: Math.round(fatigueLevel * 100),
      status,
      message,
      can_drive: fatigueLevel < 0.85
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Fatigue check failed' });
  }
});

// ── LOG DRIVE TIME ───────────────────────────────────────────────────────────
router.post('/driver/log-time', async (req: Request, res: Response) => {
  try {
    const { driver_id, hours } = req.body;

    const { data: profile } = await supabase
      .from('profiles')
      .select('fatigue_hours_today')
      .eq('id', driver_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    const newHours = (profile.fatigue_hours_today || 0) + (hours || 0);

    await supabase
      .from('profiles')
      .update({ fatigue_hours_today: newHours })
      .eq('id', driver_id);

    res.status(200).json({ success: true, total_hours_today: newHours });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to log time' });
  }
});

// ── CONTRACTOR AGREEMENT INFO ────────────────────────────────────────────────
router.get('/driver/contract/:driver_id', async (req: Request, res: Response) => {
  try {
    const { driver_id } = req.params;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, contractor_code, commission_rate, driver_dna_score, driver_dna_tier, created_at')
      .eq('id', driver_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    // Commission tiers based on DriverDNA
    let effectiveRate = profile.commission_rate || 0.08;
    if ((profile.driver_dna_score || 0) >= 90) effectiveRate = 0.05; // Elite: 5%
    if ((profile.driver_dna_score || 0) >= 95) effectiveRate = 0.03; // Legend: 3%

    res.status(200).json({
      driver: profile.full_name,
      contractor_code: profile.contractor_code,
      base_commission: '8%',
      effective_commission: `${Math.round(effectiveRate * 100)}%`,
      dna_score: profile.driver_dna_score,
      tier: profile.driver_dna_tier,
      member_since: profile.created_at,
      contract_type: 'Independent Service Provider',
      terms: 'AFAT platform usage agreement. Driver retains full independence. Commission deducted per completed trip.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch contract' });
  }
});

export default router;
