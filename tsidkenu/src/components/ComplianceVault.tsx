"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, FileText, Scale, Landmark, HardHat, Music, Briefcase, ChevronRight } from 'lucide-react';

export default function ComplianceVault() {
  const [analyzing, setAnalyzing] = useState(false);
  
  const fields = [
    { id: 'corporate', label: 'Corporate & OHADA', icon: Scale, color: 'text-blue-400' },
    { id: 'fintech', label: 'Fintech (COBAC)', icon: Landmark, color: 'text-emerald-400' },
    { id: 'labor', label: 'Labor (Art. 35)', icon: HardHat, color: 'text-orange-400' },
    { id: 'entertainment', label: 'Entertainment (OAPI)', icon: Music, color: 'text-purple-400' },
    { id: 'mining', label: 'Mining & Energy', icon: Briefcase, color: 'text-amber-400' }
  ];

  const guideSteps = [
    { title: "Company Registration", detail: "RCCM + Articles of Association validation for Douala/Yaoundé registry." },
    { title: "Tax Compliance", detail: "Monthly NIU filings and CNPS employee contribution audits." },
    { title: "OAPI Trademark", detail: "Intellectual property protection across CEMAC member states." }
  ];

  return (
    <section className="p-8 max-w-6xl mx-auto space-y-10">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic border-l-4 border-teal-accent pl-4">Compliance Guardian</h1>
          <p className="text-xs text-slate-500 font-mono">POWERED BY GEMINI 3.0 FLASH • REAL-TIME AUDITING</p>
        </div>
        <div className="flex gap-2">
           <div className="h-2 w-2 rounded-full bg-teal-accent animate-pulse" />
           <span className="text-[10px] font-bold text-teal-accent uppercase tracking-widest">OneDrive Sync Active</span>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        {fields.map((f) => (
          <button key={f.id} className="glass p-6 rounded-2xl flex flex-col items-center gap-3 hover:bg-teal-glow transition-all group">
            <f.icon className={`w-8 h-8 ${f.color} group-hover:scale-110 transition-transform`} />
            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-300">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="glass p-8 rounded-3xl space-y-6 relative overflow-hidden">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
              <FileText className="text-teal-accent w-6 h-6" />
              <h3 className="font-bold uppercase text-sm tracking-widest">OneDrive Corporate Guidance</h3>
            </div>
            
            <div className="space-y-4">
              {guideSteps.map((step, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-navy-800/50 transition-colors border border-transparent hover:border-teal-accent/20 cursor-pointer group">
                  <div className="w-6 h-6 rounded-full bg-navy-800 flex items-center justify-center text-[10px] font-bold text-teal-accent">{i+1}</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-200 group-hover:text-teal-accent transition-colors">{step.title}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{step.detail}</p>
                  </div>
                  <ChevronRight className="ml-auto w-4 h-4 text-slate-700 group-hover:text-teal-accent" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass p-8 rounded-3xl bg-teal-glow/5 border-teal-accent/20">
            <div className="flex items-center gap-2 mb-6 uppercase text-[10px] font-bold text-teal-accent">
              <ShieldCheck className="w-4 h-4" />
              System Integrity
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Gemini 3.0 Flash is currently scanning your **OneDrive Legal Folder**. All document variations are cross-referenced with the latest 2026 CEMAC regulations.
            </p>
            <div className="space-y-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Current Audit Status</p>
              <div className="h-1.5 w-full bg-navy-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} className="h-full bg-teal-accent" />
              </div>
              <p className="text-[10px] text-right text-teal-accent font-bold">65% Scanned</p>
            </div>
          </div>

          <div className="glass p-8 rounded-3xl border-dashed border-2 border-slate-800 flex flex-col items-center justify-center text-center py-12 group cursor-pointer hover:border-teal-accent/50 transition-all">
             <div className="w-12 h-12 rounded-full bg-navy-800 flex items-center justify-center mb-4 group-hover:bg-teal-glow transition-all">
               <FileText className="text-slate-600 group-hover:text-teal-accent" />
             </div>
             <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">New Matter Onboarding</p>
             <p className="text-[11px] text-slate-700">Drag & Drop files for instant compliance verify</p>
          </div>
        </div>
      </div>
    </section>
  );
}
