import express, { Request, Response } from 'express';
import { createIncident, getActiveIncidents, supabase } from '../infra/supabase';
import { IncidentType, Severity } from '../types';
import { waBridge } from '../services/WhatsAppBridge';
import crypto from 'crypto';
import { dnaQueue } from '../services/QueueService';

const router = express.Router();

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

// Fetch Active Incidents for Mapbox/Native App View
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const incidents = await getActiveIncidents();
    res.status(200).json(incidents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
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

    console.log(`💳 Payment checkout: ${amount} XAF from ${phone} via ${provider || 'momo'}`);

    // In production: call PawaPay API to initiate collection
    // For now: return success with a mock transaction ID
    const transactionId = `AFAT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    res.status(200).json({
      success: true,
      transactionId,
      status: 'pending',
      message: `Payment of ${amount} XAF initiated. Check your phone for PIN prompt.`
    });
  } catch (error) {
    console.error('Payment checkout error:', error);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// ── PAYMENT WEBHOOK (PawaPay callback) ────────────────────────────────────
router.post('/webhook/pawapay', async (req: Request, res: Response) => {
  try {
    const { transactionId, status, externalId } = req.body;
    
    console.log(`💰 PawaPay webhook: ${transactionId} (Ext: ${externalId}) → ${status}`);

    // Update booking status in Supabase if transaction is completed
    if (status === 'COMPLETED' && externalId) {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed', payment_status: 'paid' })
        .eq('id', externalId);

      if (error) console.error('Error updating booking:', error);
      
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
      watch_url: `https://afat.app/watch/${token}`,
      expires_at: expiresAt
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

export default router;
