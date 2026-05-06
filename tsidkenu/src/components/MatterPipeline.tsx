"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Milestone, ChevronRight, CheckCircle2, Clock, Scale, AlertCircle } from 'lucide-react';

export default function MatterPipeline() {
  const steps = [
    { label: 'Assignation', status: 'Completed', date: '12 Apr', desc: 'Service of process by Bailiff.' },
    { label: 'Mise en État', status: 'Active', date: 'Now', desc: 'Exchange of conclusions and evidence.' },
    { label: 'Plaidoiries', status: 'Upcoming', date: '22 May', desc: 'Oral arguments before the judge.' },
    { label: 'Délibéré', status: 'Pending', date: 'TBD', desc: 'Judge considering the final decision.' },
    { label: 'Jugement', status: 'Pending', date: 'TBD', desc: 'Final court order / ruling.' }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">The OHADA Pipeline</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Matter Lifecycle Tracking • Procedural Flow</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
           <button className="px-4 py-2 bg-white text-[10px] font-black uppercase rounded shadow-sm text-heritage-green">Civil / Fond</button>
           <button className="px-4 py-2 text-[10px] font-black uppercase text-slate-400">Référé / Urgent</button>
        </div>
      </div>

      <div className="relative pt-12 pb-24">
        {/* The Connector Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2" />
        
        <div className="flex justify-between relative z-10">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center space-y-6 group">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-500 shadow-xl ${
                step.status === 'Completed' ? 'bg-heritage-green border-heritage-green text-white' :
                step.status === 'Active' ? 'bg-white border-heritage-green text-heritage-green scale-110' :
                'bg-white border-slate-100 text-slate-300'
              }`}>
                {step.status === 'Completed' ? <CheckCircle2 className="w-8 h-8" /> : 
                 step.status === 'Active' ? <Clock className="w-8 h-8 animate-pulse" /> : <Milestone className="w-8 h-8" />}
              </div>
              
              <div className="space-y-1 max-w-[120px]">
                <h4 className={`text-sm font-bold uppercase tracking-tight ${step.status === 'Active' ? 'text-heritage-green' : 'text-slate-700'}`}>
                  {step.label}
                </h4>
                <p className="text-[10px] text-slate-400 font-bold">{step.date}</p>
                <p className="text-[9px] text-slate-400 leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
         <div className="p-10 bg-white border border-slate-200 rounded-[3rem] space-y-6 shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-widest text-heritage-green flex items-center gap-2">
               <Scale className="w-5 h-5" /> Evidence Ledger (Bordereau)
            </h3>
            <div className="space-y-4">
               {[
                 "Contract de Service (Original)",
                 "Mise en Demeure (Huissier Seal)",
                 "Relevé de Compte Bancaire"
               ].map((p, i) => (
                 <div key={i} className="flex justify-between items-center p-4 bg-paper-white rounded-2xl border border-slate-100 group hover:border-heritage-green cursor-pointer transition-all">
                    <span className="text-xs font-bold text-slate-700">Pièce No. 0{i+1}: {p}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-heritage-green" />
                 </div>
               ))}
            </div>
            <button className="w-full py-3 bg-heritage-green text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Generate Formal Bordereau</button>
         </div>

         <div className="p-10 bg-slate-900 rounded-[3rem] text-white space-y-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-heritage-green/10 to-transparent" />
            <h3 className="text-xs font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
               <AlertCircle className="w-4 h-4" /> Procedural Warning
            </h3>
            <p className="text-lg heading-serif leading-relaxed">
              Missing <span className="text-orange-400">Certificat de Non-Appel</span> from previous jurisdiction.
            </p>
            <p className="text-xs opacity-60 leading-relaxed">
              TSIDKENU Intelligence suggests this will block the current 'Mise en État' if not rectified by Friday.
            </p>
            <button className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20 transition-all">
               Request Document from Client
            </button>
         </div>
      </div>
    </section>
  );
}
