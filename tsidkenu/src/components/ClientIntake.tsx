"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, MessageSquare, DollarSign, ShieldAlert, FileText, ChevronRight, Mic, CheckCircle } from 'lucide-react';

export default function ClientIntake() {
  const [intakeComplete, setIntakeComplete] = useState(false);
  const [step, setStep] = useState(1);

  const runIntake = () => {
    setStep(2);
    setTimeout(() => {
      setStep(3);
      setTimeout(() => setIntakeComplete(true), 2000);
    }, 2000);
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">AI Client Intake & CRM</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Conversion Engine • Automated Lead Qualification</p>
        </div>
        <button className="btn-classic text-xs">+ New Manual Intake</button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Intake Process */}
        <div className="md:col-span-2">
          {!intakeComplete ? (
            <div className="p-12 bg-white rounded-[3rem] border border-slate-200 shadow-xl space-y-8 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-heritage-green/5 rounded-full flex items-center justify-center text-heritage-green mb-4">
                 <Mic className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                 <h2 className="text-2xl heading-serif text-heritage-green">New Client Voice/Text Intake</h2>
                 <p className="text-sm text-slate-500 max-w-md mx-auto">TSIDEK Intelligence is ready to categorize the legal issue and suggest initial fees.</p>
              </div>
              <div className="w-full max-w-md">
                 <textarea 
                   placeholder="Enter the client's problem statement or upload a voice note..." 
                   className="w-full bg-slate-50 border-none rounded-2xl p-6 text-sm outline-none focus:ring-1 focus:ring-heritage-green h-40 transition-all"
                 />
              </div>
              <button 
                onClick={runIntake}
                className="px-12 py-4 bg-heritage-green text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
              >
                {step === 1 ? 'Analyze Issue' : step === 2 ? 'Categorizing...' : 'Generating Opinion...'}
              </button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
               <div className="p-10 bg-white border border-slate-200 rounded-[3rem] shadow-xl space-y-8">
                  <div className="flex justify-between items-start">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                           <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold text-heritage-green">Intake Synthesis Complete</h3>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">TSIDEK Intelligence v3.1</p>
                        </div>
                     </div>
                     <span className="text-xs font-black text-heritage-green bg-heritage-green/5 px-4 py-2 rounded-full">Case ID: INT-2024-001</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Legal Categorization</h4>
                        <div className="p-6 bg-paper-white rounded-3xl border border-slate-100">
                           <p className="text-sm font-bold text-slate-700">OHADA Commercial Dispute</p>
                           <p className="text-[10px] text-slate-500 mt-1 uppercase">Subfield: Debt Recovery (AUPSRVE)</p>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suggested Provision</h4>
                        <div className="p-6 bg-heritage-green text-white rounded-3xl">
                           <p className="text-xl font-black">750,000 XAF</p>
                           <p className="text-[10px] opacity-70 mt-1 uppercase">Based on 85% Complexity Score</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">First-Pass Legal Opinion</h4>
                     <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 italic text-sm text-slate-600 leading-relaxed">
                        "The client presents a strong prima facie case for debt recovery under the Uniform Act. Key evidence missing: Formal Mise en Demeure. Recommend immediate Huissier service to trigger the procedural clock."
                     </div>
                  </div>

                  <div className="flex gap-4">
                     <button className="flex-1 py-4 bg-heritage-green text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg">Onboard as Active Matter</button>
                     <button className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest">Save as Lead</button>
                  </div>
               </div>
            </motion.div>
          )}
        </div>

        {/* CRM / Risk Scoring */}
        <div className="space-y-8">
           <div className="p-8 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <ShieldAlert className="w-32 h-32" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Lead Risk Scoring</h3>
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                       <span>Profitability Potential</span>
                       <span className="text-emerald-400">88%</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full">
                       <div className="w-[88%] h-full bg-emerald-400 rounded-full" />
                    </div>
                 </div>
                 <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                       <span>Payment Reliability</span>
                       <span className="text-orange-400">Medium Risk</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full">
                       <div className="w-1/2 h-full bg-orange-400 rounded-full" />
                    </div>
                 </div>
              </div>
           </div>

           <div className="p-8 bg-paper-white border border-slate-200 rounded-[3rem] space-y-6 shadow-sm">
              <div className="flex items-center gap-3 text-heritage-green">
                 <DollarSign className="w-5 h-5" />
                 <h4 className="text-xs font-black uppercase tracking-widest">Conversion Tracking</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-white rounded-2xl border border-slate-50 text-center">
                    <p className="text-xl font-black text-heritage-green">14</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">New Leads</p>
                 </div>
                 <div className="p-4 bg-white rounded-2xl border border-slate-50 text-center">
                    <p className="text-xl font-black text-heritage-green">82%</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Conv. Rate</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}
