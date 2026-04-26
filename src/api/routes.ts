import express, { Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { traccarService } from '../services/traccar';
import { WhatsAppBridge } from '../services/WhatsAppBridge';
import { createIncident, getActiveIncidents } from '../infra/supabase';
import { IncidentType, Severity } from '../types';
import { IntelligenceBridge } from '../services/intelligenceBridge';
import { IntelligenceEngine } from '../core/brain';
import { ModelFactory } from '../models/factory';
import { PaymentService } from '../services/payment';
import { geminiClient } from '../infra/gemini';
import { USSDSessionManager } from '../services/USSDSessionManager';
import { ArkeselClient } from '../infra/arkesel';

const router = express.Router();
const bridge = new IntelligenceBridge();
const upload = multer({ storage: multer.memoryStorage() });

// Supabase Admin client (service role)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || ''
);

// ==============================================================================
// 🟢 WHATSAPP WEBHOOK (Multi-Modal Accessibility)
// ==============================================================================

router.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  const { Body, From, Latitude, Longitude, MediaUrl0, MediaContentType0 } = req.body;
  
  const message = {
    from: From,
    body: Body,
    latitude: Latitude ? parseFloat(Latitude) : undefined,
    longitude: Longitude ? parseFloat(Longitude) : undefined,
    audioUrl: MediaContentType0?.includes('audio') ? MediaUrl0 : undefined,
    timestamp: new Date().toISOString()
  };

  try {
    const reply = await WhatsAppBridge.getInstance().handleIncoming(message);
    res.type('text/xml');
    res.send(`
      <Response>
        <Message>${reply}</Message>
      </Response>
    `);
  } catch (err) {
    console.error('[WhatsApp] Webhook error:', err);
    res.status(500).send('Error');
  }
});

// ==============================================================================
// 🔐 CUSTOM OTP AUTH (Via Arkesel SMS — Cost Optimized)
// ==============================================================================

router.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    const formattedPhone = phone.startsWith('+') ? phone : `+237${phone}`;
    await ArkeselClient.sendOTP(formattedPhone);

    res.status(200).json({ success: true, message: 'OTP sent via Arkesel.' });
  } catch (error: any) {
    console.error('[OTP] Send error:', error.message);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;
    const formattedPhone = phone.startsWith('+') ? phone : `+237${phone}`;
    const isValid = ArkeselClient.verifyOTP(formattedPhone, code);

    if (!isValid) return res.status(401).json({ error: 'Invalid or expired OTP.' });

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.phone === formattedPhone);
    let userId = existingUser?.id;

    if (!existingUser) {
      const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
        phone: formattedPhone,
        phone_confirm: true,
        user_metadata: { role: 'commuter' },
      });
      userId = newUser.user?.id;
    }

    res.status(200).json({ success: true, userId, phone: formattedPhone });
  } catch (error: any) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ==============================================================================
// 🧠 INTELLIGENCE BRIDGE API
// ==============================================================================

router.post('/intelligence/voice-report', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const { reporter_id } = req.body;
    const file = req.file;

    if (!file || !reporter_id) return res.status(400).json({ error: 'Missing audio or reporter ID.' });

    const analysis = await geminiClient.analyzeVoiceBuffer(file.buffer, file.mimetype || 'audio/webm');
    res.status(200).json({
      success: true,
      transcription: analysis?.description || 'Audio analyzed',
      classification: analysis
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process voice report.' });
  }
});

// ==============================================================================
// 🚦 ARKESEL WEBHOOKS (SMS / USSD) — Cost Optimized
// ==============================================================================

router.post('/arkesel/sms', async (req: Request, res: Response) => {
  try {
    const { from, text } = req.body;
    const result = await bridge.classifyIntent(from, text);
    await ArkeselClient.sendSMS(from, result.replyText);
    res.status(200).json({ success: true, action: result.action });
  } catch (error: any) {
    res.status(500).json({ error: 'SMS processing failed.' });
  }
});

// Legacy AT route (backwards compat)
router.post('/at/sms', async (req: Request, res: Response) => {
  try {
    const { from, text } = req.body;
    const result = await bridge.classifyIntent(from, text);
    await ArkeselClient.sendSMS(from, result.replyText);
    res.status(200).json({ success: true, action: result.action });
  } catch (error: any) {
    res.status(500).json({ error: 'SMS failed.' });
  }
});

// USSD Multi-Service Router (Arkesel callback)
router.post('/arkesel/ussd', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, text, serviceCode, sessionId } = req.body;
    
    // USSD text from Arkesel is cumulative (e.g. "1*2*1"). We only need the latest part
    const parts = (text || '').split('*');
    const lastInput = parts[parts.length - 1];

    const reply = USSDSessionManager.handleInput(phoneNumber, lastInput, serviceCode || '*121#');
    
    res.set('Content-Type', 'text/plain');
    res.send(reply);
  } catch (error: any) {
    console.error('[USSD] Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Erreur systeme. Réessayez plus tard.');
  }
});

// ==============================================================================
// 🏦 FULL OS FINANCIAL INTEGRATION (PawaPay MoMo Callback)
// ==============================================================================

router.post('/pawapay/webhook', async (req: Request, res: Response) => {
  try {
    // PawaPay sends an array or single object depending on configuration
    const payload = Array.isArray(req.body) ? req.body[0] : req.body;
    const { depositId, status, payer } = payload;

    console.log(`[Finance] Webhook Triggered for Deposit: ${depositId} | Status: ${status}`);

    if (status === 'COMPLETED') {
        const { EscrowService } = await import('../services/EscrowService');
        const { updateUserSubscription } = await import('../infra/supabase');

        // Logic based on Deposit ID Prefix (Full OS Scope)
        if (depositId.startsWith('escrow_')) {
            await EscrowService.confirmPayment(depositId, `MOMO_WEBHOOK_${Date.now()}`);
            console.log(`[Finance] Rent OS Escrow ${depositId} marked as ACTIVE.`);
        } 
        else if (depositId.startsWith('sub_')) {
            const userId = depositId.split('_')[1]; // Assume format: sub_USERID_TIMESTAMP
            await updateUserSubscription(userId, 'guardian');
            console.log(`[Finance] Mobility OS Guardian Tier activated for user ${userId}.`);
        }
    } else if (status === 'FAILED') {
        console.warn(`[Finance] Payment ${depositId} failed. User cancelled or insufficient funds.`);
    }

    res.status(200).send('Webhook Received');
  } catch (error) {
    console.error('[Finance] Webhook Error:', error);
    res.status(500).send('Error');
  }
});

// Legacy AT USSD route (backwards compat)
router.post('/at/ussd', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, text, serviceCode } = req.body;
    const parts = (text || '').split('*');
    const lastInput = parts[parts.length - 1];
    const reply = USSDSessionManager.handleInput(phoneNumber, lastInput, serviceCode || '*121#');
    res.set('Content-Type', 'text/plain');
    res.send(reply);
  } catch (error: any) {
    console.error('[USSD] Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Erreur systeme. Réessayez plus tard.');
  }
});

// ==============================================================================
// 💳 MODERN CHECKOUT & GPS
// ==============================================================================

router.post('/payment/checkout', async (req: Request, res: Response) => {
  try {
    const { amount, phone, operatorId } = req.body;
    const result = await new PaymentService().initiateMomoPayment(phone, Number(amount), 'Ride Payment', 'pawapay');
    
    // Send SMS receipt via Arkesel
    if (result.success) {
      await ArkeselClient.sendNotification(phone, 'Paiement Confirmé', `${amount} XAF débité. Ref: ${result.transactionId}`);
    }
    
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

router.post('/sos/trigger', async (req: Request, res: Response) => {
  try {
    const { userId, latitude, longitude, address } = req.body;
    await createIncident({
      reporterId: userId,
      reporterUsername: 'SOS_USER',
      type: 'sos' as IncidentType,
      description: 'SOS TRIGGERED',
      location: { latitude, longitude },
      address: address || '',
      severity: 5 as Severity,
      confirmations: 0,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000)
    });
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'SOS failed.' });
  }
});

router.post('/traccar/webhook', async (req: Request, res: Response) => {
  const { secret } = req.query;
  if (secret !== process.env.TRACCAR_SECRET_WEBHOOK) return res.status(401).send('Unauthorized');
  try {
    await traccarService.handlePositionUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Error');
  }
});

export default router;
