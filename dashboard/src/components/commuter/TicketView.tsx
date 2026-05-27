import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Share2, Clock, MapPin, User, QrCode, Shield } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createGuardianToken, issueSecureTicket } from '../../supabaseClient';

interface Props {
  booking: {
    id: string;
    routeName: string;
    origin: string;
    destination: string;
    seatLabel: string;
    price: number;
    operatorName: string;
    plateNumber: string;
    departureTime: string;
    transactionId: string;
    paymentMethod: string;
  };
  onBack: () => void;
}

export function TicketView({ booking, onBack }: Props) {
  const [ticketPayload, setTicketPayload] = useState('');
  const [guardianUrl, setGuardianUrl] = useState('');
  const [guardianBusy, setGuardianBusy] = useState(false);

  const fallbackPayload = useMemo(() => JSON.stringify({
    bid: booking.id,
    txid: booking.transactionId,
    seat: booking.seatLabel,
    route: booking.routeName,
    ts: Date.now(),
  }), [booking.id, booking.transactionId, booking.seatLabel, booking.routeName]);

  useEffect(() => {
    let active = true;

    issueSecureTicket(booking.id).then(({ data, error }) => {
      if (!active) return;

      if (!error && data?.ticket) {
        setTicketPayload(JSON.stringify(data.ticket));
        return;
      }

      console.warn('[AFAT] Secure ticket issuance failed, falling back to local payload.', error);
      setTicketPayload(fallbackPayload);
    });

    return () => {
      active = false;
    };
  }, [booking.id, fallbackPayload]);

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Billet MobilityOS — ${booking.routeName}`,
        text: `Trajet: ${booking.origin} → ${booking.destination}\nPlace: ${booking.seatLabel}\nPrix: ${booking.price} FCFA`,
      });
    }
  };

  const handleGuardianShare = async () => {
    if (guardianBusy) return;
    setGuardianBusy(true);

    const { data, error } = await createGuardianToken(booking.id);
    setGuardianBusy(false);

    if (error || !data?.watch_url) {
      console.error('[AFAT] Guardian link creation failed:', error);
      return;
    }

    setGuardianUrl(data.watch_url);

    if (navigator.share) {
      await navigator.share({
        title: `AFAT Guardian Watch — ${booking.routeName}`,
        text: `Suivez ce trajet AFAT en direct: ${data.watch_url}`,
        url: data.watch_url,
      });
      return;
    }

    await navigator.clipboard.writeText(data.watch_url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-6 font-sans">
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8">
        <button onClick={onBack} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-extrabold text-lg">Billet Électronique</h1>
        <button onClick={handleShare} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full max-w-sm mb-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">Guardian Trip Sharing</p>
            <p className="text-sm font-bold text-white">Share a live watch link with family or a trusted contact.</p>
          </div>
        </div>
        <button
          onClick={handleGuardianShare}
          className="w-full rounded-2xl bg-emerald-500 text-slate-950 py-3 text-xs font-black uppercase tracking-widest"
        >
          {guardianBusy ? 'Creating Guardian Link...' : 'Share Guardian Link'}
        </button>
        {guardianUrl && (
          <p className="mt-3 break-all text-[10px] font-mono text-emerald-200">{guardianUrl}</p>
        )}
      </div>

      {/* Ticket Card */}
      <div className="w-full max-w-sm relative">
        {/* Top Section */}
        <div className="bg-blue-600 rounded-t-3xl p-6 pb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-200" />
              <span className="text-xs font-mono text-blue-200 uppercase tracking-widest">MobilityOS</span>
            </div>
            <span className="text-[10px] font-mono text-blue-200 uppercase">#{booking.transactionId}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-blue-200 mb-1">Départ</p>
              <p className="text-xl font-black">{booking.origin}</p>
            </div>
            <div className="w-12 h-px bg-blue-400/50 relative">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full"></div>
            </div>
            <div className="flex-1 text-right">
              <p className="text-xs text-blue-200 mb-1">Arrivée</p>
              <p className="text-xl font-black">{booking.destination}</p>
            </div>
          </div>
        </div>

        {/* Divider with circles */}
        <div className="relative h-0">
          <div className="absolute -left-4 -top-4 w-8 h-8 bg-slate-950 rounded-full"></div>
          <div className="absolute -right-4 -top-4 w-8 h-8 bg-slate-950 rounded-full"></div>
          <div className="border-b-2 border-dashed border-slate-700 mx-4"></div>
        </div>

        {/* Bottom Section */}
        <div className="bg-slate-900 border border-white/5 border-t-0 rounded-b-3xl p-6 pt-8">
          {/* QR Code */}
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={ticketPayload || fallbackPayload} size={160} />
            </div>
          </div>
          <p className="text-center text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-6">
            Présentez ce code au chauffeur
          </p>

          {/* Trip Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400"><Clock className="w-4 h-4" /> <span className="text-xs">Heure</span></div>
              <span className="text-sm font-bold">{new Date(booking.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400"><User className="w-4 h-4" /> <span className="text-xs">Chauffeur</span></div>
              <span className="text-sm font-bold">{booking.operatorName}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400"><MapPin className="w-4 h-4" /> <span className="text-xs">Place</span></div>
              <span className="text-sm font-bold">{booking.seatLabel}</span>
            </div>
            <div className="h-px bg-white/5"></div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-300">Total payé</span>
              <span className="text-lg font-black text-blue-400">{booking.price} FCFA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Offline Button */}
      <button className="mt-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
        <Download className="w-4 h-4" /> Sauvegarder hors ligne
      </button>
    </div>
  );
}
