"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Search, UserCheck, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

export default function ConflictShield() {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runCheck = () => {
    setSearching(true);
    setTimeout(() => {
      setResult({
        status: 'Conflict Detected',
        severity: 'High',
        matches: [
          { name: 'Société Maritime X', case: 'Matter CM-2023-012', role: 'Adversary', lawyer: 'Me. Eboa' }
        ],
        details: 'You are currently representing a direct competitor in a similar litigation. Professional ethics (OHADA Bar) suggest recusal or information barrier.'
      });
      setSearching(false);
    }, 2500);
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Conflict of Interest Shield</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Ethical Safeguard • Cross-Matter Intelligence</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        <div className="p-10 bg-white rounded-[3rem] border border-slate-200 shadow-xl space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">New Matter Entry Audit</h3>
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="Client Name" className="w-full bg-slate-50 border-none rounded-xl p-4 text-xs outline-none focus:ring-1 focus:ring-heritage-green" />
              <input type="text" placeholder="Adverse Party" className="w-full bg-slate-50 border-none rounded-xl p-4 text-xs outline-none focus:ring-1 focus:ring-heritage-green" />
            </div>
            <textarea placeholder="Describe the matter scope..." className="w-full bg-slate-50 border-none rounded-xl p-4 text-xs outline-none focus:ring-1 focus:ring-heritage-green h-32" />
          </div>
          <button 
            onClick={runCheck}
            disabled={searching}
            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              searching ? 'bg-slate-100 text-slate-400' : 'bg-heritage-green text-white shadow-lg hover:scale-105'
            }`}
          >
            {searching ? 'Scanning Firm Memory...' : 'Run Ethical Conflict Scan'}
          </button>
        </div>

        {result && !searching && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-8 rounded-[3rem] border shadow-2xl space-y-6 ${
              result.status === 'Conflict Detected' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                result.status === 'Conflict Detected' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {result.status === 'Conflict Detected' ? <ShieldAlert className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
              </div>
              <div>
                <h3 className={`text-xl font-black ${result.status === 'Conflict Detected' ? 'text-red-900' : 'text-emerald-900'}`}>
                  {result.status}
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Severity: {result.severity}</p>
              </div>
            </div>
            
            <div className="bg-white/50 rounded-2xl p-6 space-y-4">
               {result.matches.map((m: any, i: number) => (
                 <div key={i} className="flex justify-between items-center text-sm font-bold text-slate-700">
                    <div className="flex items-center gap-3">
                       <FileText className="w-4 h-4 text-slate-400" />
                       <span>{m.name}</span>
                    </div>
                    <span className="text-[10px] text-red-600 uppercase bg-red-100 px-2 py-0.5 rounded-full">{m.role}</span>
                 </div>
               ))}
               <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-200/50">
                 {result.details}
               </p>
            </div>
            
            <div className="flex gap-4">
               <button className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Apply Info Barrier</button>
               <button className="flex-1 py-3 border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Reject Matter</button>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
