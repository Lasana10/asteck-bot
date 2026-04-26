import React, { useState } from 'react';
import { Headphones, Search, PackageOpen, Car, Clock, MessageCircle, Star, ChevronRight, X, Send, Loader2 } from 'lucide-react';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

type ServiceType = 'vip_request' | 'lost_found' | 'complaint' | 'special_needs';

export function ConciergeHelp({ userId, userName, onClose }: Props) {
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const services = [
    {
      id: 'vip_request' as ServiceType,
      icon: <Car className="w-6 h-6" />,
      title: 'Véhicule VIP',
      desc: 'Réservez un véhicule climatisé ou premium',
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
    },
    {
      id: 'lost_found' as ServiceType,
      icon: <PackageOpen className="w-6 h-6" />,
      title: 'Objets Perdus',
      desc: 'Signalez un objet perdu dans un véhicule',
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20'
    },
    {
      id: 'complaint' as ServiceType,
      icon: <MessageCircle className="w-6 h-6" />,
      title: 'Réclamation',
      desc: 'Signalez un problème avec un opérateur',
      color: 'text-red-500 bg-red-500/10 border-red-500/20'
    },
    {
      id: 'special_needs' as ServiceType,
      icon: <Star className="w-6 h-6" />,
      title: 'Besoins Spéciaux',
      desc: 'Accessibilité, bagages volumineux, etc.',
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    }
  ];

  const handleSubmit = async () => {
    if (!message.trim() || !selectedService) return;
    setLoading(true);

    // In production: this would create a support ticket in Supabase
    // and notify the nearest concierge agent via Telegram
    await new Promise(resolve => setTimeout(resolve, 1500));

    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose} />
        <div className="relative bg-slate-900 border border-white/5 rounded-[40px] p-10 max-w-sm w-full text-center shadow-2xl animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-emerald-500/20">
            <Headphones className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-xl font-black text-emerald-500 uppercase mb-2">Demande Envoyée</h3>
          <p className="text-slate-400 text-sm mb-6">Notre équipe concierge vous contactera sous 15 minutes.</p>
          <p className="text-[10px] text-slate-600 font-mono mb-8">Référence: #AST-{Date.now().toString(36).toUpperCase()}</p>
          <button
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95"
          >
            Compris
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose} />

      <div className="relative bg-slate-900 border border-white/5 rounded-[40px] p-6 max-w-sm w-full shadow-2xl animate-in slide-in-from-bottom duration-500 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-500 hover:text-white p-2 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Headphones className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-black uppercase italic">Concierge</h3>
          <p className="text-slate-500 text-sm">Services premium & assistance</p>
        </div>

        {/* Service Selection */}
        {!selectedService ? (
          <div className="space-y-3">
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => setSelectedService(service.id)}
                className="w-full flex items-center gap-4 bg-slate-950/50 border border-white/5 hover:border-white/10 p-4 rounded-2xl transition-all group text-left active:scale-[0.98]"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${service.color}`}>
                  {service.icon}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">{service.title}</p>
                  <p className="text-[10px] text-slate-500">{service.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            <button
              onClick={() => setSelectedService(null)}
              className="text-[10px] text-blue-500 font-bold uppercase tracking-widest hover:text-blue-400"
            >
              ← Retour
            </button>

            <div className={`border rounded-2xl p-4 ${services.find(s => s.id === selectedService)?.color}`}>
              <div className="flex items-center gap-3">
                {services.find(s => s.id === selectedService)?.icon}
                <h4 className="font-bold text-sm">{services.find(s => s.id === selectedService)?.title}</h4>
              </div>
            </div>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={
                selectedService === 'vip_request'
                  ? 'Ex: Je cherche un bus climatisé pour Douala demain matin...'
                  : selectedService === 'lost_found'
                  ? 'Ex: J\'ai oublié mon sac noir dans un Toyota Hiace plaque CE-xxx...'
                  : selectedService === 'complaint'
                  ? 'Décrivez le problème rencontré...'
                  : 'Décrivez vos besoins spécifiques...'
              }
              className="w-full bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-4 min-h-[120px] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 transition-colors resize-none"
            />

            {selectedService === 'vip_request' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] text-amber-400 font-bold">Délai moyen de réponse: 15 min</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer la demande
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
