import express, { Request, Response } from 'express';
import { createIncident, getActiveIncidents, supabase } from '../infra/supabase';
import { IncidentType, Severity } from '../types';
import { waBridge } from '../services/WhatsAppBridge';
import crypto from 'crypto';
import { dnaQueue } from '../services/QueueService';
import { aiRouter } from '../services/AIRouter';
import { brainService } from '../services/brain';
import { PaymentService } from '../services/payment';

const router = express.Router();
const ticketSecret = process.env.TICKET_SIGNING_SECRET || process.env.SUPABASE_KEY || 'afat-dev-ticket-secret';
const paymentService = new PaymentService();

function signTicketPayload(payload: string) {
  return crypto.createHmac('sha256', ticketSecret).update(payload).digest('hex');
}

async function appendWalletLedgerEntry(entry: any) {
  const { error } = await supabase
    .from('wallet_ledger')
    .insert({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...entry,
    });

  if (error) throw error;
}

async function ensureOperatorWallet(operatorId: string) {
  const { data: existing, error } = await supabase
    .from('operator_wallets')
    .select('operator_id, balance_xaf')
    .eq('operator_id', operatorId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('operator_wallets')
    .insert({
      operator_id: operatorId,
      balance_xaf: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('operator_id, balance_xaf')
    .single();

  if (createError) throw createError;
  return created;
}

async function applyRideCredit(booking: any, reference: string) {
  if (!booking?.operator_id) return;

  const amount = Number(booking.price_paid || 0);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const { data: existingEntry, error: existingError } = await supabase
    .from('wallet_ledger')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('operator_id', booking.operator_id)
    .eq('entry_type', 'ride_credit')
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') throw existingError;
  if (existingEntry) return;

  const commission = Math.round(amount * 0.08);
  const operatorNet = amount - commission;

  await appendWalletLedgerEntry({
    operator_id: booking.operator_id,
    booking_id: booking.id,
    entry_type: 'ride_credit',
    direction: 'credit',
    gross_amount: amount,
    commission_amount: commission,
    net_amount: operatorNet,
    status: 'posted',
    reference,
  });

  const wallet = await ensureOperatorWallet(booking.operator_id);
  const { error: walletUpdateError } = await supabase
    .from('operator_wallets')
    .update({
      balance_xaf: Number(wallet.balance_xaf || 0) + operatorNet,
      updated_at: new Date().toISOString()
    })
    .eq('operator_id', booking.operator_id);

  if (walletUpdateError) throw walletUpdateError;
}

function isBoardablePaymentStatus(paymentStatus: string) {
  return ['paid', 'cash_due'].includes(paymentStatus || '');
}

async function expireSeatHolds(routeId?: string, seatLabel?: string) {
  let query = supabase
    .from('seat_holds')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString());

  if (routeId) query = query.eq('route_id', routeId);
  if (seatLabel) query = query.eq('seat_label', seatLabel);

  await query;
}

function scoreFromIncidentLoad(incidentCount: number, severeCount: number) {
  const score = 100 - (incidentCount * 4) - (severeCount * 8);
  return Math.max(5, Math.min(100, score));
}

function scoreFromCompliance(records: any[]) {
  if (!records.length) return 0;
  const verified = records.filter((record) => record.status === 'verified').length;
  const dueSoon = records.filter((record) => {
    if (!record.due_at) return false;
    const remaining = new Date(record.due_at).getTime() - Date.now();
    return remaining <= 30 * 24 * 60 * 60 * 1000 && remaining > 0;
  }).length;
  const overdue = records.filter((record) => {
    if (!record.due_at) return false;
    return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
  }).length;

  const score = 100 - (overdue * 22) - (dueSoon * 7) + (verified * 5);
  return Math.max(0, Math.min(100, score));
}

function parsePointText(location?: string | null) {
  if (!location) return null;
  const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function publicError(error: any, fallback: string) {
  console.error(fallback, error);
  return process.env.NODE_ENV === 'production'
    ? fallback
    : error?.message || fallback;
}

// ── AUTHENTICATION (OTP Flow) ────────────────────────────────
router.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    
    console.log(`📡 Sending OTP to ${phone} (Mock Mode)`);
    // In a real scenario, call Africa's Talking or WhatsApp Bridge here
    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

    console.log(`🔐 Verifying OTP for ${phone}: ${code} (Mock Mode)`);
    // In mock mode, 123456 is always valid
    if (code === '123456') {
      res.status(200).json({ success: true, userId: 'mock-user-id', phone });
    } else {
      res.status(400).json({ error: 'Invalid OTP code' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Sovereign Incident Reporting (Direct from Native App)
router.post('/report', async (req: Request, res: Response) => {
  try {
    const { userId, type, description, latitude, longitude, severity } = req.body;

    if (!userId || !type || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const incident = await createIncident({
      reporterId: userId,
      reporterUsername: 'native_app_user',
      type: type as IncidentType,
      description,
      location: { latitude, longitude },
      address: '',
      severity: (severity as Severity) || 3,
      confirmations: 0,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    if (incident) {
      res.status(201).json({ success: true, incidentId: incident.id });
    } else {
      res.status(500).json({ error: 'Failed to create incident' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/sos/panic', async (req: Request, res: Response) => {
  try {
    const { user_id, user_name, latitude, longitude, source } = req.body;
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!user_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'user_id, latitude and longitude are required' });
    }

    const incidentPayload = {
      type: 'emergency',
      description: `Emergency SOS from ${user_name || 'AFAT user'}. Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      latitude: lat,
      longitude: lng,
      location: `POINT(${lng} ${lat})`,
      severity: 5,
      source: source || 'sos_button',
      status: 'active',
      reporter_id: user_id,
      reporter_username: user_name || 'AFAT user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert(incidentPayload)
      .select()
      .single();

    if (incidentError) {
      console.warn('SOS accepted without incident persistence:', incidentError.message);
      return res.status(202).json({
        success: true,
        persisted: false,
        status: 'active',
        alert: incidentPayload,
      });
    }

    const { error: sosError } = await supabase
      .from('sos_events')
      .insert({
        user_id,
        incident_id: incident.id,
        latitude: lat,
        longitude: lng,
        status: 'active',
        created_at: new Date().toISOString(),
      });

    res.status(201).json({
      success: true,
      persisted: true,
      status: 'active',
      incident_id: incident.id,
      sos_logged: !sosError,
    });
  } catch (error: any) {
    res.status(500).json({ error: publicError(error, 'SOS dispatch failed') });
  }
});

// Fetch Active Incidents for Mapbox/Native App View
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const incidents = await getActiveIncidents();
    res.status(200).json(incidents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { message, directive, target_role, source, tier, severity, metadata } = req.body;
    const finalDirective = String(directive || message || '').trim();

    if (!finalDirective) {
      return res.status(400).json({ error: 'message or directive is required' });
    }

    const payload = {
      source: source || 'dashboard',
      basis: 'manual_broadcast',
      directive: finalDirective.slice(0, 600),
      tier: tier || (Number(severity || 0) >= 4 ? 1 : 2),
      target_role: target_role || 'all',
      status: Number(severity || 0) >= 4 ? 'broadcasted' : 'pending_admin',
      metadata: metadata || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('sentinel_directives')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('Broadcast accepted without persistence:', error.message);
      return res.status(202).json({
        success: true,
        persisted: false,
        directive: payload,
      });
    }

    res.status(201).json({ success: true, persisted: true, directive: data });
  } catch (error: any) {
    res.status(500).json({ error: publicError(error, 'Broadcast failed') });
  }
});

// ── VOICE INTELLIGENCE (Whisper transcription + AI classification) ────────
router.post('/intelligence/voice-report', async (req: Request, res: Response) => {
  try {
    // For now: accept the audio file and return a mock classification
    // In production: pipe audio to Groq Whisper API for transcription,
    // then classify with Gemini/Groq
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      // Mock mode — return simulated transcription
      console.log('🎙️ Voice report received (Mock Mode — no GROQ_API_KEY)');
      return res.status(200).json({
        transcription: 'Accident signalé près du carrefour Bastos',
        classification: {
          type: 'accident',
          severity: 3,
          location: 'Carrefour Bastos',
          confidence: 0.85
        }
      });
    }

    // Real mode: call Groq Whisper
    // The audio comes as multipart form data
    // We'd use multer to parse it, then forward to Groq
    console.log('🎙️ Voice report received — forwarding to Groq Whisper');
    
    // Placeholder for real Whisper integration
    res.status(200).json({
      transcription: 'Processing with Groq Whisper...',
      classification: {
        type: 'other',
        severity: 3,
        location: 'Unknown',
        confidence: 0.5
      }
    });
  } catch (error) {
    console.error('Voice report error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

// ── PAYMENT CHECKOUT (PawaPay / MoMo / Orange Money) ──────────────────────
router.post('/payment/checkout', async (req: Request, res: Response) => {
  try {
    const { amount, phone, booking_id, provider } = req.body;

    if (!amount || !phone) {
      return res.status(400).json({ error: 'Amount and phone required' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const normalizedProvider = provider === 'africastalking' || provider === 'pawapay'
      ? provider
      : undefined;

    console.log(`💳 Payment checkout: ${parsedAmount} XAF from ${phone} via ${normalizedProvider || 'auto-fallback'}`);
    const payment = await paymentService.initiateMomoPayment(
      phone,
      parsedAmount,
      `Booking ${booking_id || 'direct'}`,
      normalizedProvider
    );

    if (!payment.success || !payment.transactionId) {
      return res.status(502).json({
        success: false,
        error: payment.message || 'Payment provider unavailable'
      });
    }

    const transactionId = payment.transactionId;

    if (booking_id) {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          transaction_id: transactionId,
          payment_status: 'collection_pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', booking_id);

      if (bookingError) throw bookingError;
    }

    res.status(200).json({
      success: true,
      transactionId,
      status: 'pending',
      message: payment.message || `Payment of ${parsedAmount} XAF initiated. Check your phone for PIN prompt.`
    });
  } catch (error) {
    console.error('Payment checkout error:', error);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

router.get('/payment/provider-readiness', (_req: Request, res: Response) => {
  const provider = process.env.PAYMENT_PROVIDER || 'pawapay';
  const hasPawaPay = Boolean(process.env.PAYMENT_API_KEY);
  const hasAT = Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);

  res.status(200).json({
    success: true,
    provider,
    ready: {
      pawapay: hasPawaPay,
      africastalking: hasAT
    },
    mode: hasPawaPay || hasAT ? 'live_or_hybrid' : 'stub',
    recommendation: hasPawaPay
      ? 'PawaPay is configured.'
      : 'Configure PAYMENT_API_KEY (PawaPay) for live collection.'
  });
});

// ── PAYMENT WEBHOOK (PawaPay callback) ────────────────────────────────────
router.post('/webhook/pawapay', async (req: Request, res: Response) => {
  try {
    const { transactionId, status, externalId } = req.body;
    
    console.log(`💰 PawaPay webhook: ${transactionId} (Ext: ${externalId}) → ${status}`);

    // Update booking status in Supabase if transaction is completed
    if (status === 'COMPLETED' && externalId) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, operator_id, price_paid, payment_status')
        .eq('id', externalId)
        .maybeSingle();

      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          transaction_id: transactionId,
          updated_at: new Date().toISOString()
        })
        .eq('id', externalId);

      if (error) console.error('Error updating booking:', error);

      if (booking?.operator_id) {
        await applyRideCredit(booking, transactionId);
      }
      
      // TODO: Emit Socket.io event here if socket server is initialized
      // io.to(externalId).emit('payment_confirmed', { transactionId });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── WHATSAPP WEBHOOK (Twilio) ─────────────────────────────────────────────
router.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const response = await waBridge.handleWebhook(req.body);
    
    // Twilio expects TwiML in response, but for WhatsApp we can just send the text back 
    // or use their MessagingResponse. Since we handle it in waBridge, we send a 200.
    res.set('Content-Type', 'text/xml');
    res.send(`<Response><Message>${response}</Message></Response>`);
  } catch (error) {
    console.error('WhatsApp Webhook error:', error);
    res.status(500).send('<Response><Message>Désolé, une erreur est survenue.</Message></Response>');
  }
});

// ── GUARDIAN MODE (Token-based Live Watch) ────────────────────────────────
router.post('/guardian/token', async (req: Request, res: Response) => {
  try {
    const { booking_id, expires_in_minutes } = req.body;
    
    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://asteck-bot.pages.dev';

    const token = require('crypto').randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (expires_in_minutes || 60) * 60 * 1000);

    const { error } = await supabase
      .from('guardian_tokens')
      .insert({
        token,
        booking_id,
        expires_at: expiresAt
      });

    if (error) throw error;

    res.status(200).json({
      token,
      watch_url: `${frontendBaseUrl.replace(/\/$/, '')}/watch/${token}`,
      expires_at: expiresAt
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const { prompt, user_name, user_role, context, language, task } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const systemPrompt = [
      `You are AFAT Guidance, the calm transport intelligence layer for Cameroon.`,
      `User: ${user_name || 'Guardian'} (${user_role || 'commuter'}).`,
      context ? `Context: ${context}` : '',
      language ? `Reply in ${language}.` : '',
      `Keep replies short, practical, and transport-focused.`
    ].filter(Boolean).join('\n');

    const result = await aiRouter.route((task as any) || 'predict', {
      prompt,
      system: systemPrompt,
      text: prompt
    });

    res.status(200).json({
      success: true,
      text: result.text,
      model: result.model
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: error.message || 'AI chat failed' });
  }
});

router.post('/ai/vision', async (req: Request, res: Response) => {
  try {
    const { image, prompt } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image required' });
    }

    const result = await aiRouter.route('vision', {
      image,
      prompt: prompt || 'Analyze this AFAT transport image for hazards, incidents, or useful route intelligence.'
    });

    res.status(200).json({
      success: true,
      text: result.text,
      model: result.model
    });
  } catch (error: any) {
    console.error('AI vision error:', error);
    res.status(500).json({ error: error.message || 'AI vision failed' });
  }
});

router.post('/ai/analyze', async (req: Request, res: Response) => {
  try {
    const { text, language } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }

    const result = await brainService.analyze(text);
    res.status(200).json({
      success: true,
      language: language || 'fr',
      result
    });
  } catch (error: any) {
    console.error('AI analyze error:', error);
    res.status(500).json({ error: error.message || 'AI analyze failed' });
  }
});

// ── OPS COMMAND CENTER (Reports, Dispatch, Safety, Demand) ────────────────
router.get('/ops/report-center', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: reports, error } = await supabase
      .from('incidents')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) throw error;

    const items = reports || [];
    const active = items.filter((report: any) => !['resolved', 'dismissed', 'expired', 'false'].includes(report.status));
    const severe = active.filter((report: any) => Number(report.severity || 0) >= 4);
    const verified = items.filter((report: any) => ['verified', 'confirmed'].includes(report.status) || report.verification_status === 'verified');

    res.status(200).json({
      success: true,
      summary: {
        total_24h: items.length,
        active: active.length,
        severe: severe.length,
        verified: verified.length,
        safety_score: scoreFromIncidentLoad(active.length, severe.length),
      },
      reports: items,
    });
  } catch (error: any) {
    console.error('Report center error:', error);
    res.status(500).json({ error: error.message || 'Report center fetch failed' });
  }
});

router.patch('/ops/reports/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolver_id } = req.body;
    const allowed = ['new', 'pending', 'verified', 'resolved', 'dismissed', 'expired'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const update: any = {
      status,
      verification_status: status,
      updated_at: new Date().toISOString(),
    };

    if (['resolved', 'dismissed', 'expired'].includes(status)) {
      update.resolved_at = new Date().toISOString();
      if (resolver_id) update.resolver_id = resolver_id;
    }

    const { data, error } = await supabase
      .from('incidents')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ success: true, report: data });
  } catch (error: any) {
    console.error('Report status update error:', error);
    res.status(500).json({ error: error.message || 'Report status update failed' });
  }
});

router.get('/ops/safety-score', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query.lat || 3.866);
    const lng = Number(req.query.lng || 11.514);
    const radiusKm = Number(req.query.radius_km || 5);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('id, type, severity, status, latitude, longitude, location, created_at')
      .gte('created_at', since)
      .neq('status', 'false');

    if (error) throw error;

    const radiusDegrees = radiusKm / 111;
    const nearby = (incidents || []).filter((incident: any) => {
      const point = {
        latitude: Number(incident.latitude ?? parsePointText(incident.location)?.latitude),
        longitude: Number(incident.longitude ?? parsePointText(incident.location)?.longitude),
      };
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
      return Math.abs(point.latitude - lat) <= radiusDegrees && Math.abs(point.longitude - lng) <= radiusDegrees;
    });

    const severe = nearby.filter((incident: any) => Number(incident.severity || 0) >= 4);
    const score = scoreFromIncidentLoad(nearby.length, severe.length);

    res.status(200).json({
      success: true,
      score,
      level: score >= 80 ? 'stable' : score >= 55 ? 'caution' : 'high-risk',
      radius_km: radiusKm,
      incident_count: nearby.length,
      severe_count: severe.length,
      top_signals: nearby.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Safety score error:', error);
    res.status(500).json({ error: error.message || 'Safety score failed' });
  }
});

router.get('/ops/demand-radar', async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const [{ data: bookings }, { data: vehicles }, { data: movements }] = await Promise.all([
      supabase.from('bookings').select('id, status, route_id, created_at, routes(name, origin, destination)').gte('created_at', since),
      supabase.from('vehicles').select('id, operator_id, type, is_available, current_lat, current_lng, last_ping_at').eq('is_available', true),
      supabase.from('movement_logs').select('id, latitude, longitude, created_at').gte('created_at', since).limit(200),
    ]);

    const bookingCount = (bookings || []).length;
    const vehicleCount = (vehicles || []).length;
    const pulseCount = (movements || []).length;
    const pressure = bookingCount * 2 + pulseCount * 0.25 - vehicleCount;

    res.status(200).json({
      success: true,
      summary: {
        booking_count: bookingCount,
        active_vehicles: vehicleCount,
        telemetry_pulses: pulseCount,
        pressure: Math.round(pressure),
        recommendation: pressure > 20 ? 'add_supply' : pressure < 4 ? 'hold_supply' : 'balanced',
      },
      routes: bookings || [],
      vehicles: vehicles || [],
      pulses: movements || [],
    });
  } catch (error: any) {
    console.error('Demand radar error:', error);
    res.status(500).json({ error: error.message || 'Demand radar failed' });
  }
});

router.get('/ops/compliance-radar', async (_req: Request, res: Response) => {
  try {
    const lookback = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: records, error } = await supabase
      .from('compliance_records')
      .select('*')
      .gte('created_at', lookback)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const items = records || [];
    const active = items.filter((record: any) => !['verified', 'missing'].includes(record.status));
    const verified = items.filter((record: any) => record.status === 'verified');
    const dueSoon = items.filter((record: any) => {
      if (!record.due_at) return false;
      const remaining = new Date(record.due_at).getTime() - Date.now();
      return remaining > 0 && remaining <= 30 * 24 * 60 * 60 * 1000;
    });
    const overdue = items.filter((record: any) => {
      if (!record.due_at) return false;
      return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
    });

    const byRole = items.reduce((acc: Record<string, number>, record: any) => {
      acc[record.role] = (acc[record.role] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      summary: {
        total: items.length,
        active: active.length,
        verified: verified.length,
        due_soon: dueSoon.length,
        overdue: overdue.length,
        score: scoreFromCompliance(items),
      },
      by_role: byRole,
      records: items,
    });
  } catch (error: any) {
    console.error('Compliance radar error:', error);
    res.status(500).json({ error: error.message || 'Compliance radar failed' });
  }
});

router.get('/dispatch/active', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .select('*')
      .in('status', ['queued', 'assigned', 'en_route', 'arrived'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.status(200).json({ success: true, dispatches: data || [] });
  } catch (error: any) {
    console.error('Active dispatch fetch error:', error);
    res.status(500).json({ error: error.message || 'Active dispatch fetch failed' });
  }
});

router.get('/compliance/summary/:profileId', async (req: Request, res: Response) => {
  try {
    const { profileId } = req.params;

    const { data: profileRecords, error: profileError } = await supabase
      .from('compliance_records')
      .select('*')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false });

    if (profileError) throw profileError;

    const { data: memberships, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, status, companies:company_id(id, name, fleet_size)')
      .eq('profile_id', profileId)
      .eq('status', 'active');

    if (membershipError) throw membershipError;

    const companyIds = (memberships || []).map((membership: any) => membership.company_id).filter(Boolean);
    const { data: companyRecords, error: companyRecordsError } = companyIds.length
      ? await supabase
          .from('compliance_records')
          .select('*')
          .in('company_id', companyIds)
          .order('updated_at', { ascending: false })
      : { data: [], error: null as any };

    if (companyRecordsError) throw companyRecordsError;

    const records = [...(profileRecords || []), ...(companyRecords || [])];
    const score = scoreFromCompliance(records);
    const overdue = records.filter((record: any) => {
      if (!record.due_at) return false;
      return new Date(record.due_at).getTime() <= Date.now() && record.status !== 'verified';
    }).length;

    res.status(200).json({
      success: true,
      summary: {
        total: records.length,
        verified: records.filter((record: any) => record.status === 'verified').length,
        due_soon: records.filter((record: any) => {
          if (!record.due_at) return false;
          const remaining = new Date(record.due_at).getTime() - Date.now();
          return remaining > 0 && remaining <= 30 * 24 * 60 * 60 * 1000;
        }).length,
        overdue,
        score,
      },
      memberships: memberships || [],
      records,
    });
  } catch (error: any) {
    console.error('Compliance summary error:', error);
    res.status(500).json({ error: error.message || 'Compliance summary failed' });
  }
});

router.patch('/compliance/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const allowed = ['missing', 'pending', 'submitted', 'verified', 'expired', 'rejected', 'needs_followup'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid compliance status' });
    }

    const { data, error } = await supabase
      .from('compliance_records')
      .update({
        status,
        notes: notes || null,
        verified_at: status === 'verified' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, record: data });
  } catch (error: any) {
    console.error('Compliance status update error:', error);
    res.status(500).json({ error: error.message || 'Compliance status update failed' });
  }
});

router.post('/dispatch/assign', async (req: Request, res: Response) => {
  try {
    const {
      booking_id,
      route_id,
      operator_id,
      vehicle_id,
      dispatcher_id,
      origin,
      destination,
      priority,
      notes,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
    } = req.body;

    if (!operator_id && !vehicle_id && !booking_id) {
      return res.status(400).json({ error: 'operator_id, vehicle_id, or booking_id required' });
    }

    const { data, error } = await supabase
      .from('dispatch_assignments')
      .insert({
        booking_id: booking_id || null,
        route_id: route_id || null,
        operator_id: operator_id || null,
        vehicle_id: vehicle_id || null,
        dispatcher_id: dispatcher_id || null,
        origin: origin || null,
        destination: destination || null,
        priority: priority || 'normal',
        status: 'assigned',
        notes: notes || null,
        pickup_lat: pickup_lat || null,
        pickup_lng: pickup_lng || null,
        dropoff_lat: dropoff_lat || null,
        dropoff_lng: dropoff_lng || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    if (booking_id) {
      await supabase
        .from('bookings')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', booking_id);
    }

    res.status(201).json({ success: true, dispatch: data });
  } catch (error: any) {
    console.error('Dispatch assignment error:', error);
    res.status(500).json({ error: error.message || 'Dispatch assignment failed' });
  }
});

router.get('/guardian/watch/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const { data: guardianToken, error: tokenError } = await supabase
      .from('guardian_tokens')
      .select('token, booking_id, expires_at, created_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!guardianToken) {
      return res.status(404).json({ error: 'Guardian watch link not found' });
    }

    if (new Date(guardianToken.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Guardian watch link expired' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, passenger_id, operator_id, route_id, status, payment_status, seat_label, price_paid, created_at, updated_at, completed_at')
      .eq('id', guardianToken.booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const [passengerRes, operatorRes, routeRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone').eq('id', booking.passenger_id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, phone').eq('id', booking.operator_id).maybeSingle(),
      supabase.from('routes').select('id, name, origin, destination, departure_time').eq('id', booking.route_id).maybeSingle(),
    ]);

    res.status(200).json({
      success: true,
      watch: {
        token: guardianToken.token,
        expires_at: guardianToken.expires_at,
        booking: {
          ...booking,
          passenger: passengerRes.data || null,
          operator: operatorRes.data || null,
          route: routeRes.data || null,
        }
      }
    });
  } catch (error: any) {
    console.error('Guardian watch fetch error:', error);
    res.status(500).json({ error: error.message || 'Guardian watch lookup failed' });
  }
});

router.post('/payment/finalize', async (req: Request, res: Response) => {
  try {
    const { booking_id, transaction_id, method } = req.body;

    if (!booking_id || !method) {
      return res.status(400).json({ error: 'booking_id and method are required' });
    }

    const paymentStatus = method === 'cash' ? 'cash_due' : 'paid';
    const txRef = transaction_id || `AFAT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: booking, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('id, operator_id, price_paid, payment_status')
      .eq('id', booking_id)
      .single();

    if (bookingFetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: paymentStatus,
        transaction_id: txRef,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id);

    if (bookingUpdateError) throw bookingUpdateError;

    if (paymentStatus === 'paid') {
      await applyRideCredit(booking, txRef);
    }

    res.status(200).json({
      success: true,
      booking_id,
      transaction_id: txRef,
      payment_status: paymentStatus,
      status: 'confirmed'
    });
  } catch (error: any) {
    console.error('Payment finalize error:', error);
    res.status(500).json({ error: error.message || 'Payment finalization failed' });
  }
});

// ── SEAT HOLDS ───────────────────────────────────────────────────────────────
router.post('/booking/seat-hold', async (req: Request, res: Response) => {
  try {
    const { passenger_id, operator_id, route_id, seat_label, hold_minutes } = req.body;

    if (!passenger_id || !route_id || !seat_label) {
      return res.status(400).json({ error: 'passenger_id, route_id and seat_label are required' });
    }

    await expireSeatHolds(route_id, seat_label);

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('route_id', route_id)
      .eq('seat_label', seat_label)
      .in('status', ['pending', 'accepted', 'confirmed', 'completed'])
      .maybeSingle();

    if (existingBooking) {
      return res.status(409).json({ error: 'Seat is already booked' });
    }

    const { data: activeHold } = await supabase
      .from('seat_holds')
      .select('id, passenger_id, expires_at')
      .eq('route_id', route_id)
      .eq('seat_label', seat_label)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (activeHold && activeHold.passenger_id !== passenger_id) {
      return res.status(409).json({ error: 'Seat is temporarily held by another commuter' });
    }

    if (activeHold && activeHold.passenger_id === passenger_id) {
      return res.status(200).json({ success: true, hold: activeHold });
    }

    const expiresAt = new Date(Date.now() + (hold_minutes || 8) * 60 * 1000).toISOString();
    const { data: hold, error } = await supabase
      .from('seat_holds')
      .insert({
        passenger_id,
        operator_id: operator_id || null,
        route_id,
        seat_label,
        status: 'active',
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, hold });
  } catch (error: any) {
    console.error('Seat hold error:', error);
    res.status(500).json({ error: error.message || 'Seat hold failed' });
  }
});

router.post('/booking/seat-hold/release', async (req: Request, res: Response) => {
  try {
    const { hold_id } = req.body;

    if (!hold_id) {
      return res.status(400).json({ error: 'hold_id required' });
    }

    const { error } = await supabase
      .from('seat_holds')
      .update({ status: 'released', updated_at: new Date().toISOString() })
      .eq('id', hold_id)
      .eq('status', 'active');

    if (error) throw error;

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Seat hold release error:', error);
    res.status(500).json({ error: error.message || 'Seat hold release failed' });
  }
});

router.post('/booking/create-from-hold', async (req: Request, res: Response) => {
  try {
    const { hold_id, passenger_id, final_price } = req.body;

    if (!hold_id || !passenger_id || !final_price) {
      return res.status(400).json({ error: 'hold_id, passenger_id and final_price are required' });
    }

    const { data: hold, error: holdError } = await supabase
      .from('seat_holds')
      .select('*')
      .eq('id', hold_id)
      .eq('passenger_id', passenger_id)
      .eq('status', 'active')
      .single();

    if (holdError || !hold) {
      return res.status(404).json({ error: 'Seat hold not found' });
    }

    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      await supabase
        .from('seat_holds')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', hold_id);
      return res.status(409).json({ error: 'Seat hold expired' });
    }

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('route_id', hold.route_id)
      .eq('seat_label', hold.seat_label)
      .in('status', ['pending', 'accepted', 'confirmed', 'completed'])
      .maybeSingle();

    if (existingBooking) {
      return res.status(409).json({ error: 'Seat was booked while hold was being processed' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        passenger_id,
        operator_id: hold.operator_id || null,
        route_id: hold.route_id,
        seat_label: hold.seat_label,
        status: 'pending',
        payment_status: 'unpaid',
        price_paid: final_price,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    await supabase
      .from('seat_holds')
      .update({ status: 'converted', booking_id: booking.id, updated_at: new Date().toISOString() })
      .eq('id', hold_id);

    res.status(201).json({ success: true, booking });
  } catch (error: any) {
    console.error('Create booking from hold error:', error);
    res.status(500).json({ error: error.message || 'Booking creation from seat hold failed' });
  }
});

// ── WALLET WITHDRAWAL REQUESTS ──────────────────────────────────────────────
router.post('/wallet/withdraw', async (req: Request, res: Response) => {
  try {
    const { operator_id, amount } = req.body;

    if (!operator_id || !amount) {
      return res.status(400).json({ error: 'operator_id and amount are required' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('operator_wallets')
      .select('balance_xaf')
      .eq('operator_id', operator_id)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Operator wallet not found' });
    }

    if (Number(wallet.balance_xaf || 0) < parsedAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const reference = `WD-${Date.now().toString(36).toUpperCase()}`;

    await appendWalletLedgerEntry({
      operator_id,
      entry_type: 'withdrawal',
      direction: 'debit',
      gross_amount: parsedAmount,
      commission_amount: 0,
      net_amount: parsedAmount,
      status: 'requested',
      reference,
    });

    const { error: updateError } = await supabase
      .from('operator_wallets')
      .update({
        balance_xaf: Number(wallet.balance_xaf || 0) - parsedAmount,
        updated_at: new Date().toISOString()
      })
      .eq('operator_id', operator_id);

    if (updateError) throw updateError;

    res.status(200).json({
      success: true,
      withdrawal: { amount: parsedAmount, reference, status: 'requested' }
    });
  } catch (error: any) {
    console.error('Wallet withdrawal error:', error);
    res.status(500).json({ error: error.message || 'Withdrawal request failed' });
  }
});

// ── SECURE TICKET ISSUE ─────────────────────────────────────────────────────
router.post('/ticket/issue', async (req: Request, res: Response) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id required' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, operator_id, route_id, seat_label, transaction_id, payment_status, status')
      .eq('id', booking_id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!isBoardablePaymentStatus(booking.payment_status) || booking.status !== 'confirmed') {
      return res.status(400).json({ error: 'Booking is not ready for ticket issuance' });
    }

    const payload = Buffer.from(JSON.stringify({
      bid: booking.id,
      oid: booking.operator_id,
      rid: booking.route_id,
      seat: booking.seat_label,
      txid: booking.transaction_id,
      pm: booking.payment_status,
      iat: Date.now()
    })).toString('base64url');

    const signature = signTicketPayload(payload);

    res.status(200).json({
      success: true,
      ticket: {
        t: payload,
        s: signature,
      }
    });
  } catch (error: any) {
    console.error('Ticket issue error:', error);
    res.status(500).json({ error: error.message || 'Ticket issue failed' });
  }
});

// ── SECURE BOARDING VERIFICATION ────────────────────────────────────────────
router.post('/ticket/verify-boarding', async (req: Request, res: Response) => {
  try {
    const { ticket, operator_id } = req.body;

    if (!ticket?.t || !ticket?.s || !operator_id) {
      return res.status(400).json({ error: 'ticket and operator_id required' });
    }

    const expectedSignature = signTicketPayload(ticket.t);
    if (expectedSignature !== ticket.s) {
      return res.status(403).json({ error: 'Invalid ticket signature' });
    }

    const decoded = JSON.parse(Buffer.from(ticket.t, 'base64url').toString('utf8'));
    if (!decoded?.bid || !decoded?.oid) {
      return res.status(400).json({ error: 'Malformed ticket payload' });
    }

    if (decoded.oid !== operator_id) {
      return res.status(403).json({ error: 'Ticket does not belong to this operator' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, operator_id, status, payment_status')
      .eq('id', decoded.bid)
      .eq('operator_id', operator_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found for this operator' });
    }

    if (!isBoardablePaymentStatus(booking.payment_status)) {
      return res.status(400).json({ error: 'Booking is unpaid' });
    }

    if (!['confirmed', 'accepted'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking is not boardable' });
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'boarded', updated_at: new Date().toISOString() })
      .eq('id', decoded.bid)
      .eq('operator_id', operator_id);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      booking_id: decoded.bid,
      message: 'Boarding verified'
    });
  } catch (error: any) {
    console.error('Ticket verify error:', error);
    res.status(500).json({ error: error.message || 'Ticket verification failed' });
  }
});

// ── TRIP COMPLETION (Triggers DNA Update) ────────────────────────────────
router.post('/booking/complete', async (req: Request, res: Response) => {
  try {
    const { booking_id, driver_id, rating, feedback } = req.body;

    if (!booking_id || !driver_id) {
      return res.status(400).json({ error: 'booking_id and driver_id required' });
    }

    // 1. Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'completed', 
        rating, 
        feedback,
        completed_at: new Date().toISOString() 
      })
      .eq('id', booking_id);

    if (updateError) throw updateError;

    // 2. Trigger Async DNA Pipeline
    await dnaQueue.add(`dna-update-${booking_id}`, { driverId: driver_id, tripId: booking_id });

    res.status(200).json({ 
      success: true, 
      message: 'Trip completed. DriverDNA update queued.' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── WHATSAPP WEBHOOK (Twilio Integration) ──────────────────────────────
router.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const reply = await waBridge.handleWebhook(req.body);
    
    // Twilio expects TwiML response
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);
  } catch (error: any) {
    console.error('❌ WhatsApp Webhook Error:', error);
    res.status(500).send('Webhook Error');
  }
});

// ── HEALTH CHECK ─────────────────────────────────────────────────────────
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'online', 
    service: 'AFAT OS Sentinel', 
    timestamp: new Date().toISOString() 
  });
});

export default router;
