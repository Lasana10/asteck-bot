import express, { Request, Response } from 'express';
import { createIncident, getActiveIncidents } from '../infra/supabase';
import { IncidentType, Severity } from '../types';

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
    const { transactionId, status, amount } = req.body;
    
    console.log(`💰 PawaPay webhook: ${transactionId} → ${status}`);

    // TODO: Verify PawaPay signature header
    // TODO: Update booking status in Supabase
    // TODO: Emit Socket.io event to update frontend in real-time

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
