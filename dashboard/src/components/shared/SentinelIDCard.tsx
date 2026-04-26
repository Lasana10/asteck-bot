import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, Zap, QrCode, User, Phone, Fingerprint, Award, Loader2, Lock } from 'lucide-react';
import { securityService } from '../../services/SecurityService';

interface Props {
  profile: {
    full_name?: string;
    phone?: string;
    role: string;
    trust_points?: number;
    subscription_tier?: string;
    ids_number?: string;
    cni_number?: string;
    vehicle_type?: string;
    is_verified?: boolean;
    created_at?: string;
  };
  onClose?: () => void;
}

export function SentinelIDCard({ profile, onClose }: Props) {
  const [signature, setSignature] = useState<string>('');
  const isGuardian = profile.subscription_tier === 'guardian';
  const roleLabel = profile.role === 'operator' ? (profile.vehicle_type || 'Operator').toUpperCase() : profile.role.toUpperCase();
  
  // Generate a mock IDS if not present for visual effect
  const displayIDS = profile.ids_number || `SENTINEL-${profile.role.slice(0,1).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  useEffect(() => {
    async function signCard() {
      const sig = await securityService.generateIntegritySeal({
        id: displayIDS,
        name: profile.full_name,
        trust: profile.trust_points,
        role: profile.role
      });
      setSignature(sig);
    }
    signCard();
  }, [profile, displayIDS]);

  return (
    <div className="relative group perspective-1000 w-full max-w-sm mx-auto">
      {/* Glossy ID Card Container */}
      <div className={`
        relative overflow-hidden rounded-[32px] border transition-all duration-700
        ${isGuardian ? 'bg-slate-900 border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] shadow-amber-500/5' : 'bg-slate-900 border-white/10 shadow-2xl'}
        p-7 flex flex-col min-h-[480px]
      `}>
        
        {/* Holographic Overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none opacity-50"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        {isGuardian && <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl animate-pulse"></div>}

        {/* Header: Logo & IDS */}
        <div className="flex justify-between items-start mb-8 relative z-10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl border ${isGuardian ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-600/10 border-blue-500/20 text-blue-500'}`}>
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xs font-black tracking-tighter text-white/50 uppercase italic">AFAT Sentinel</h2>
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em]">Identity System</p>
            </div>
          </div>
          <div className="text-right">
             <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">IDS REFERENCE</div>
             <div className="font-mono text-[11px] text-white/80 bg-white/5 px-2 py-1 rounded-lg border border-white/5 tracking-wider">{displayIDS}</div>
          </div>
        </div>

        {/* User Info Section */}
        <div className="flex gap-6 mb-8 relative z-10">
          <div className="relative">
            <div className={`
               w-24 h-24 rounded-[28px] border-2 flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-105
               ${isGuardian ? 'border-amber-500/40 bg-slate-950' : 'border-white/10 bg-slate-950'}
            `}>
              <User className={`w-12 h-12 ${isGuardian ? 'text-amber-500/50' : 'text-white/20'}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
            </div>
            {profile.is_verified && (
               <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-1.5 rounded-full border-4 border-slate-900 shadow-lg">
                 <CheckCircle className="w-3.5 h-3.5" />
               </div>
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-center">
            <div className={`text-[10px] font-black px-2 py-0.5 rounded-md inline-block w-fit mb-2 tracking-widest ${isGuardian ? 'bg-amber-500 text-black' : 'bg-blue-600 text-white'}`}>
              {roleLabel}
            </div>
            <h1 className="text-xl font-black text-white uppercase italic tracking-tight leading-none mb-1">{profile.full_name || 'Anonymous Node'}</h1>
            <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-1.5">
               <Phone className="w-3 h-3" /> {profile.phone || '+237 --- --- ---'}
            </p>
          </div>
        </div>

        {/* Identity Markers: Quad Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8 relative z-10">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col gap-1 transition-colors hover:bg-white/10">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">National ID (CNI)</span>
             <span className="text-xs font-mono text-white/80">{profile.cni_number || 'NOT LINKED'}</span>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col gap-1 transition-colors hover:bg-white/10">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Trust Status</span>
             <div className="flex items-center gap-1.5 font-black text-blue-400 text-xs italic">
                <Zap className="w-3 h-3 fill-blue-400" /> {profile.trust_points || 0} PTS
             </div>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col gap-1 transition-colors hover:bg-white/10">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Issuance Date</span>
             <span className="text-[10px] font-mono text-white/60">{new Date(profile.created_at || Date.now()).toLocaleDateString('en-GB')}</span>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex flex-col gap-1 transition-colors hover:bg-white/10">
             <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Security Clearance</span>
             <span className={`text-[10px] font-black uppercase italic ${profile.ids_number ? 'text-emerald-400' : 'text-amber-400'}`}>
                {profile.ids_number ? 'LEVEL 1 STRATEGIC' : 'LEVEL 0 GUEST'}
             </span>
          </div>
        </div>

        {/* Verification QR Seal */}
        <div className="mt-auto flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${signature ? 'bg-emerald-500 animate-pulse' : 'bg-white/10'}`}></div>
                <span className={`text-[9px] font-black lowercase tracking-widest ${signature ? 'text-emerald-500' : 'text-white/20'}`}>
                  {signature ? 'authenticity_signed' : 'signing_identity...'}
                </span>
             </div>
             {signature && (
               <p className="text-[7px] font-mono text-white/20 truncate max-w-[120px]">SIG: {signature}</p>
             )}
             <p className="text-[8px] text-white/20 font-mono italic max-w-[140px] leading-tight">Authenticity cryptographically signed by AFAT Sentinel Protocol.</p>
          </div>
          <div className={`p-2 rounded-xl shadow-lg ring-4 ring-white/5 group-hover:scale-110 transition-transform duration-500 hover:rotate-2 ${signature ? 'bg-white' : 'bg-white/5'}`}>
             {signature ? <QrCode className="w-10 h-10 text-slate-900" /> : <Lock className="w-10 h-10 text-white/10" />}
          </div>
        </div>

        {/* Premium Braid Effect for Guardian */}
        {isGuardian && (
          <div className="absolute top-0 right-0 p-4">
             <Award className="w-8 h-8 text-amber-500/40 drop-shadow-2xl animate-spin-slow" />
          </div>
        )}
      </div>
    
      {onClose && (
        <button 
           onClick={onClose}
           className="mt-6 w-full py-4 bg-slate-900 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-[0.3em] text-white/40 hover:text-white hover:border-white/20 transition-all active:scale-95"
        >
          Close Identity Vault
        </button>
      )}
    </div>
  );
}
