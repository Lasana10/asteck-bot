"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Database, Network, Globe, Activity, ShieldCheck, Zap, ChevronRight, Binary } from 'lucide-react';

export default function LexCore() {
  const [activeModel, setActiveModel] = useState('Gemini 3.0');
  
  const metrics = [
    { label: 'Token Throughput', value: '45k/sec', icon: Zap },
    { label: 'RAG Context Depth', value: '1.2M Tokens', icon: Database },
    { label: 'OHADA Corpus Sync', value: '99.9%', icon: Globe },
    { label: 'Security Layer', value: 'Air-Gapped', icon: ShieldCheck }
  ];

  const autonomousTasks = [
    { task: 'OHADA Uniform Act Update Scan', status: 'Running', progress: 65 },
    { task: 'Cross-Border Precedent Mapping', status: 'Complete', progress: 100 },
    { task: 'Gemma 4 E4B Local Weights Sync', status: 'Waiting', progress: 0 }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-start border-b border-slate-200 pb-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-heritage-green rounded-xl flex items-center justify-center shadow-lg shadow-heritage-green/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl heading-serif text-heritage-green tracking-tight">LexCore™ Intelligence</h1>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">Operational Heart • TSIDKENU OS v1.2</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
          {['Gemma 4', 'Claude 3.5', 'Gemini 3.0'].map(m => (
            <button 
              key={m}
              onClick={() => setActiveModel(m)}
              className={`px-4 py-2 rounded-md text-[10px] font-black uppercase transition-all ${
                activeModel === m ? 'bg-white text-heritage-green shadow-sm' : 'text-slate-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <div key={i} className="glass p-6 rounded-2xl border-slate-200 shadow-sm space-y-4 hover:border-heritage-green transition-all">
            <div className="flex justify-between items-start">
              <m.icon className="w-5 h-5 text-heritage-green opacity-40" />
              <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{m.label}</p>
              <h3 className="text-xl font-black text-heritage-green">{m.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Deep Think: Autonomous Ops */}
        <div className="md:col-span-2 space-y-8">
          <div className="card-heritage p-8 rounded-3xl bg-white border border-slate-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Binary className="w-32 h-32 text-heritage-green" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-heritage-green mb-8 flex items-center gap-2">
              <Network className="w-5 h-5" />
              Autonomous Operation Matrix
            </h3>
            <div className="space-y-8 relative z-10">
              {autonomousTasks.map((t, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <h4 className="text-sm font-bold text-slate-700">{t.task}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-black">{t.status}</p>
                    </div>
                    <span className="text-xs font-black text-heritage-green">{t.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${t.progress}%` }}
                      transition={{ duration: 1.5, delay: i * 0.3 }}
                      className="h-full bg-heritage-green"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Intelligence Bridge */}
        <div className="space-y-6">
          <div className="p-8 bg-slate-900 rounded-3xl text-white space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-heritage-green/20 to-transparent pointer-events-none" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60">LexCore Bridge</h3>
            <p className="text-lg heading-serif leading-relaxed">
              Synthesizing <span className="text-emerald-400">Jurisdictional Nuances</span> across OHADA member states.
            </p>
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center group cursor-pointer hover:bg-white/10 transition-all">
                <span className="text-xs font-bold">CEMAC Compliance Scan</span>
                <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center group cursor-pointer hover:bg-white/10 transition-all">
                <span className="text-xs font-bold">Draft Loophole Audit</span>
                <ChevronRight className="w-4 h-4 opacity-40 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </div>

          <div className="p-6 bg-paper-white border border-slate-200 rounded-3xl space-y-4">
             <div className="flex items-center gap-2 text-heritage-green">
               <ShieldCheck className="w-5 h-5" />
               <h4 className="text-[10px] font-black uppercase tracking-widest">Sovereign Data Shield</h4>
             </div>
             <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
               Your firm's private data is processed locally. Zero-retention protocol active for all OHADA procedure drafting.
             </p>
          </div>
        </div>
      </div>
    </section>
  );
}
