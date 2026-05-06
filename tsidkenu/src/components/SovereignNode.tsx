"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Server, Database, Cloud, RefreshCw, ShieldCheck, Zap, HardDrive, WifiOff } from 'lucide-react';

export default function SovereignNode() {
  const syncStatus = [
    { name: 'Local SQLite Replica', status: 'Healthy', latency: '0.4ms', records: '14,240' },
    { name: 'Supabase Cloud Mirror', status: 'Synced', latency: '124ms', records: '14,240' },
    { name: 'OneDrive File Vault', status: 'Active', latency: '450ms', records: '1,120 Files' }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Sovereign Node™</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Local-First Architecture • Offline Mastery</p>
        </div>
        <div className="flex gap-4">
           <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border border-emerald-100">
              <ShieldCheck className="w-4 h-4" /> System Encryption: AES-256
           </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Core Architecture Logic */}
        <div className="md:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="p-8 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                   <HardDrive className="w-32 h-32" />
                </div>
                <div className="flex items-center gap-3">
                   <WifiOff className="w-5 h-5 text-emerald-400" />
                   <h3 className="text-sm font-black uppercase tracking-widest">Offline-First Engine</h3>
                </div>
                <p className="text-sm opacity-70 leading-relaxed font-medium">
                   TSIDKENU runs a local PostgreSQL / SQLite instance on your machine. All changes are saved instantly even without internet, then synced securely when you reconnect.
                </p>
                <div className="pt-4 border-t border-white/10">
                   <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      View Local Logs <RefreshCw className="w-3 h-3" />
                   </button>
                </div>
             </div>
             
             <div className="p-8 bg-white border border-slate-200 rounded-[3rem] space-y-6 shadow-sm">
                <div className="flex items-center gap-3 text-heritage-green">
                   <Cloud className="w-5 h-5" />
                   <h3 className="text-sm font-black uppercase tracking-widest">Global Mirror</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">
                   The Cloud Mirror ensures your data is accessible on your phone and tablet, protected by enterprise-grade Row Level Security (RLS).
                </p>
                <div className="p-4 bg-paper-white rounded-2xl border border-slate-100 flex justify-between items-center">
                   <span className="text-[10px] font-bold text-slate-400 uppercase">Last Global Sync</span>
                   <span className="text-xs font-black text-heritage-green">2 mins ago</span>
                </div>
             </div>
          </div>

          <div className="card-heritage bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
             <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Sync Pipeline Health</h3>
                <Zap className="w-4 h-4 text-heritage-green animate-pulse" />
             </div>
             <div className="p-0">
                {syncStatus.map((s, i) => (
                   <div key={i} className="p-6 border-b border-slate-50 flex justify-between items-center last:border-none">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-heritage-green/5 flex items-center justify-center text-heritage-green">
                            {s.name.includes('Local') ? <HardDrive className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                         </div>
                         <div>
                            <h4 className="text-sm font-bold text-slate-700">{s.name}</h4>
                            <p className="text-[10px] text-slate-400 uppercase">{s.records} Records Managed</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-black text-heritage-green">{s.status}</p>
                         <p className="text-[10px] text-slate-400 font-bold">{s.latency}</p>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        </div>

        {/* Security / Governance */}
        <div className="space-y-8">
           <div className="p-8 bg-heritage-green text-white rounded-[3rem] space-y-6 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Sovereign Data Pledge</h3>
              <p className="text-lg heading-serif leading-relaxed">
                 You are the <span className="text-emerald-300">Absolute Owner</span> of your legal database.
              </p>
              <div className="space-y-4 pt-4 border-t border-white/10">
                 <p className="text-xs opacity-70 leading-relaxed font-medium">
                    TSIDKENU does not store firm secrets on shared servers. Your private encryption keys are managed locally by the **Sovereign Node**.
                 </p>
              </div>
           </div>

           <div className="p-8 bg-paper-white border border-slate-200 rounded-[3rem] space-y-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-emerald-400 shadow-xl mb-4">
                 <ShieldCheck className="w-10 h-10" />
              </div>
              <h4 className="text-sm font-bold text-heritage-green uppercase tracking-widest">Air-Gapped Ready</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                 All legal intelligence calculations (RAG) are performed locally by LexCore. Your documents never leave your machine during analysis.
              </p>
           </div>
        </div>
      </div>
    </section>
  );
}
