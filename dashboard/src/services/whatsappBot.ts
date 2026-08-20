/**
 * AFAT OS — WhatsApp Business API Bot
 * Replaces Africa's Talking USSD (too costly)
 * Uses Meta Cloud API — FREE up to 1,000 conversations/month
 * 
 * Deploy this on Render alongside your existing backend.
 * 
 * Setup:
 * 1. Go to developers.facebook.com → Create app → WhatsApp product
 * 2. Get WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID
 * 3. Add to Render env vars
 * 4. Set webhook URL: https://your-render-url.com/api/whatsapp/webhook
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'afat-sentinel-2025';

// ── Session state (use Redis in production) ───────────────
const sessions = new Map<string, { step: string; data: any }>();

// ── Webhook verification (Meta requirement) ───────────────
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Incoming message handler ──────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always 200 first to avoid retries

  try {
    const body = req.body;
    if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) return;

    const message = body.entry[0].changes[0].value.messages[0];
    const from = message.from; // User's WhatsApp number
    const msgText = (message.text?.body || '').trim().toLowerCase();
    const msgType = message.type;

    // Handle interactive button replies
    const buttonReply = message?.interactive?.button_reply?.id;
    const listReply = message?.interactive?.list_reply?.id;
    const incoming = buttonReply || listReply || msgText;

    await handleMessage(from, incoming, message);
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
  }
});

// ── Main message router ───────────────────────────────────
async function handleMessage(from: string, text: string, raw: any) {
  const session = sessions.get(from) || { step: 'main_menu', data: {} };

  // Global commands
  if (['menu', 'aide', 'help', '0', 'annuler'].includes(text)) {
    sessions.set(from, { step: 'main_menu', data: {} });
    return sendMainMenu(from);
  }

  switch (session.step) {
    case 'main_menu':
      return handleMainMenu(from, text);
    
    case 'book_from':
      session.data.from = text;
      session.step = 'book_to';
      sessions.set(from, session);
      return sendText(from, `📍 Départ: *${text}*\n\nMaintenant, entrez votre destination:`);
    
    case 'book_to':
      session.data.to = text;
      session.step = 'book_confirm';
      sessions.set(from, session);
      // Fetch real routes from Supabase
      const routes = await fetchRoutes(session.data.from, text);
      return sendRouteList(from, routes, session.data);
    
    case 'select_route':
      const routeId = text.replace('route_', '');
      session.data.routeId = routeId;
      session.step = 'confirm_payment';
      sessions.set(from, session);
      return sendPaymentConfirm(from, session.data);

    case 'sos_contact':
      await triggerSOS(from, text);
      sessions.set(from, { step: 'main_menu', data: {} });
      return sendText(from, `🆘 *SOS ACTIVÉ*\nVotre position a été envoyée à vos contacts d'urgence et au réseau AFAT.\n\nTapez *MENU* pour revenir au menu.`);

    case 'check_status':
      const bookingStatus = await getLatestBooking(from);
      sessions.set(from, { step: 'main_menu', data: {} });
      return sendBookingStatus(from, bookingStatus);

    default:
      sessions.set(from, { step: 'main_menu', data: {} });
      return sendMainMenu(from);
  }
}

// ── Menu Handlers ─────────────────────────────────────────
function handleMainMenu(from: string, text: string) {
  switch (text) {
    case '1': case 'réserver': case 'book':
      sessions.set(from, { step: 'book_from', data: {} });
      return sendText(from, `🚕 *RÉSERVATION*\n\nEntrez votre point de départ (ex: *Bastos*, *Mokolo*, *Mvan*):`);
    
    case '2': case 'statut':
      sessions.set(from, { step: 'check_status', data: {} });
      return sendText(from, '🔍 Recherche de vos réservations...');
    
    case '3': case 'sos': case 'urgence':
      sessions.set(from, { step: 'sos_contact', data: {} });
      return sendText(from, `🆘 *MODE SOS*\n\nEntrez le numéro de téléphone de votre contact d'urgence (ou tapez *SKIP* pour alerter directement):`);
    
    case '4': case 'solde': case 'wallet':
      return sendWalletBalance(from);
    
    case '5': case 'score': case 'dna':
      return sendDriverScore(from);

    default:
      return sendMainMenu(from);
  }
}

// ── Message Senders ───────────────────────────────────────
async function sendMainMenu(to: string) {
  await sendInteractiveButtons(to,
    `🛡️ *AFAT SENTINEL*\n_Intelligence Mobilité — Cameroun_\n\nBonjour! Comment puis-je vous aider?`,
    [
      { id: '1', title: '🚕 Réserver un trajet' },
      { id: '2', title: '📋 Statut réservation' },
      { id: '3', title: '🆘 SOS Urgence' },
    ]
  );
}

async function sendRouteList(to: string, routes: any[], data: any) {
  if (!routes || routes.length === 0) {
    return sendText(to, `❌ Aucun trajet trouvé de *${data.from}* vers *${data.to}*.\n\nTapez *MENU* pour recommencer.`);
  }

  const rows = routes.slice(0, 5).map(r => ({
    id: `route_${r.id}`,
    title: `${r.origin} → ${r.destination}`,
    description: `${r.price_per_seat} XAF · ${r.vehicle_type} · ${r.operator_name || 'AFAT'}`
  }));

  await sendList(to,
    `🗺️ Trajets disponibles de *${data.from}* → *${data.to}*:`,
    'Choisir un trajet',
    'Résultats AFAT',
    rows
  );

  sessions.set(to, { step: 'select_route', data });
}

async function sendPaymentConfirm(to: string, data: any) {
  await sendInteractiveButtons(to,
    `💳 *CONFIRMATION*\n\nTrajet sélectionné\nPaiement: MTN MoMo / Orange Money\n\n✅ Tapez *CONFIRMER* ou appuyez sur le bouton pour payer.`,
    [
      { id: 'pay_momo', title: '💛 Payer MTN MoMo' },
      { id: 'pay_orange', title: '🟠 Payer Orange Money' },
    ]
  );
}

async function sendWalletBalance(to: string) {
  // Look up user by phone
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, trust_points')
    .eq('phone', `+${to}`)
    .maybeSingle();

  const name = profile?.full_name || 'Citoyen';
  const points = profile?.trust_points || 0;

  await sendText(to, 
    `💰 *PORTEFEUILLE AFAT*\n\n👤 ${name}\n⭐ Points de confiance: *${points} pts*\n\n_Pour recharger, utilisez votre app AFAT ou passez par MTN MoMo.*_\n\nTapez *MENU* pour revenir.`
  );
}

async function sendDriverScore(to: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, trust_score, driver_dna_tier')
    .eq('phone', `+${to}`)
    .maybeSingle();

  if (!profile?.trust_score || profile.driver_dna_tier === 'Insufficient verified evidence') {
    return sendText(to, `❌ Driver DNA non disponible: AFAT attend encore assez de trajets, notes et preuves terrain verifiees.\n\nTapez *MENU*.`);
  }

  const tier = profile.driver_dna_tier || 'Evidence pending';
  const score = profile.trust_score || 0;
  const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));

  await sendText(to,
    `🧬 *DRIVER DNA SCORE*\n\n👤 ${profile.full_name}\n\n[${bar}] ${score}/100\n🏅 Niveau: *${tier}*\n\n_Améliorez votre score en maintenant un bon comportement de conduite._\n\nTapez *MENU*.`
  );
}

async function sendBookingStatus(to: string, booking: any) {
  if (!booking) {
    return sendText(to, `📋 Aucune réservation active trouvée.\n\nTapez *1* pour réserver un trajet.`);
  }

  const statusEmoji: Record<string, string> = {
    pending: '⏳', confirmed: '✅', completed: '🏁', cancelled: '❌'
  };

  await sendText(to,
    `📋 *VOTRE RÉSERVATION*\n\n${statusEmoji[booking.status] || '📍'} Statut: *${booking.status?.toUpperCase()}*\n🗺️ Route: ${booking.origin} → ${booking.destination}\n💰 Montant: ${booking.amount_xaf} XAF\n🔢 Ref: #${booking.id?.substring(0, 8)}\n\nTapez *MENU* pour revenir.`
  );
}

// ── SOS Handler ───────────────────────────────────────────
async function triggerSOS(phone: string, contactPhone: string) {
  // Insert SOS incident into Supabase
  await supabase.from('incidents').insert([{
    type: 'sos',
    description: `SOS via WhatsApp from +${phone}`,
    reporter_username: `WhatsApp:${phone}`,
    severity: 5,
    source: 'whatsapp_sos',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }]);

  // Notify the emergency contact if provided
  if (contactPhone && contactPhone !== 'skip') {
    await sendText(contactPhone.replace(/\D/g, ''),
      `🆘 *ALERTE SOS AFAT*\n\n+${phone} a déclenché une alerte d'urgence.\nRéseau AFAT notifié. Contactez immédiatement cette personne.\n\n_Message automatique AFAT Sentinel_`
    );
  }
}

// ── Supabase Helpers ──────────────────────────────────────
async function fetchRoutes(origin: string, destination: string) {
  const { data } = await supabase
    .from('routes')
    .select(`id, name, origin, destination, price_per_seat, vehicle_type, profiles:operator_id(full_name)`)
    .ilike('origin', `%${origin}%`)
    .ilike('destination', `%${destination}%`)
    .eq('is_active', true)
    .limit(5);

  return (data || []).map((r: any) => ({
    ...r,
    operator_name: r.profiles?.full_name
  }));
}

async function getLatestBooking(phone: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', `+${phone}`)
    .maybeSingle();

  if (!profile) return null;

  const { data } = await supabase
    .from('bookings')
    .select(`*, routes(name, origin:origin, destination:destination)`)
    .eq('passenger_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// ── WhatsApp API Calls ────────────────────────────────────
async function sendText(to: string, body: string) {
  await callWhatsAppAPI({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false }
  });
}

async function sendInteractiveButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]) {
  await callWhatsAppAPI({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title.substring(0, 20) } }))
      }
    }
  });
}

async function sendList(to: string, bodyText: string, buttonLabel: string, sectionTitle: string, rows: any[]) {
  await callWhatsAppAPI({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [{ title: sectionTitle, rows }]
      }
    }
  });
}

async function callWhatsAppAPI(payload: object) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('WhatsApp API error:', err);
    }
  } catch (err) {
    console.error('WhatsApp API call failed:', err);
  }
}

export default router;
