import React from 'react';
import { Shield, Sparkles, Map, Bot, ArrowRight, Activity, Smartphone } from 'lucide-react';

export function LandingPage({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <div className="min-h-screen text-slate-50 font-sans selection:bg-blue-500/30 relative">
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/20 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 w-1/3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 relative">
              <Shield className="w-5 h-5 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse border-2 border-slate-900"></div>
            </div>
            <span className="font-black text-xl tracking-tight hidden sm:block">Mobility<span className="text-blue-500">OS</span></span>
          </div>

          <div className="hidden md:flex items-center justify-center gap-8 w-1/3 text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
            <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" /> Réseau Actif</span>
          </div>

          <div className="flex items-center justify-end gap-4 w-1/3">
            <button 
              onClick={onEnterDashboard}
              className="px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest bg-white text-slate-900 hover:bg-slate-200 transition-colors shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            >
              ACCÉDER AU PANEL
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden min-h-screen flex items-center justify-center text-center">
        {/* VIBRANT CSS BACKGROUND GRADIANT INSTEAD OF EMPTY MAP */}
        <div className="absolute inset-0 bg-slate-950 -z-20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/30 blur-[120px] rounded-full pointer-events-none -z-10 mix-blend-screen opacity-50 animate-pulse" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none -z-10 mix-blend-screen" />

        <div className="max-w-5xl mx-auto relative z-10 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] mb-10 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <Sparkles className="w-3 h-3" />
            <span>AFAT SENTINEL — VUE DU TERRAIN</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/20 uppercase italic transition-all">
            L'INTELLIGENCE <br /> <span className="text-blue-500 underline decoration-blue-500/30 underline-offset-8">URBAINE.</span>
          </h1>
          
          <p className="text-md md:text-lg text-slate-300 max-w-xl mx-auto mb-14 leading-relaxed font-medium">
            Découvrez la ville à travers les yeux de l'IA. <br />
            <span className="text-slate-500 italic text-sm">Le premier système d'exploitation de mobilité en Afrique Centrale.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button 
              onClick={onEnterDashboard}
              className="px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-500/40 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 italic"
            >
              <Map className="w-5 h-5" />
              Lancer le Grid
            </button>
            <a
              href="https://t.me/fat_sentinel_bot"
              target="_blank"
              rel="noreferrer"
              className="px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all flex items-center gap-3 italic"
            >
              <Smartphone className="w-5 h-5 text-blue-400" />
              Telegram App
            </a>
          </div>

          {/* Quick Stats Overlay (Floating inside Hero) */}
          <div className="grid grid-cols-3 gap-12 mt-24 border-t border-white/5 pt-12">
            <div>
               <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 italic">Précision</p>
               <p className="text-3xl font-black text-white italic">99.2%</p>
            </div>
            <div>
               <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 italic">Nodes Live</p>
               <p className="text-3xl font-black text-white italic">YAO/DLA</p>
            </div>
            <div>
               <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1 italic">Moteur</p>
               <p className="text-3xl font-black text-white italic">GEMINI</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid with Glass Panels */}
      <section className="py-32 px-6 relative" id="intelligence">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-3xl -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-10 hover:border-blue-500/50 transition-all group shadow-2xl shadow-black/50">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl">
                <Map className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic">Routage Sentinel</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                Nos algorithmes prédisent les congestions avant qu'elles ne surviennent. Le flux urbain réinventé.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-10 hover:border-emerald-500/50 transition-all group shadow-2xl shadow-black/50">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl">
                <Activity className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic">Vérité de Terrain</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                Vérification hybride (Citoyens + IA). Chaque signalement est une donnée certifiée.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-10 hover:border-purple-500/50 transition-all group shadow-2xl shadow-black/50">
              <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl">
                <Bot className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic">OS Intégré</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                Bridges WhatsApp et Telegram intégrés. L'intelligence là où vous êtes déjà.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
