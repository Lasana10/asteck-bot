"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, AlertCircle, FileText, UserCheck, ShieldCheck, ChevronRight, Scale, Info } from 'lucide-react';

export default function LegalFirstAid() {
  const [stage, setStage] = useState(0); // 0: Start, 1: Explanation, 2: Risk, 3: Connect

  const steps = [
    { title: "Understand the Law", icon: Info },
    { title: "Assess the Risk", icon: AlertCircle },
    { title: "Take Guided Action", icon: Scale }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">TSIDEK App <span className="text-xl text-slate-400">| Public Portal</span></h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Legal First Aid • Powered by TSIDEK Intelligence</p>
        </div>
        <div className="flex gap-4">
           <div className="flex -space-x-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 overflow-hidden">
                   <img src={`https://i.pravatar.cc/150?u=${i}`} alt="user" />
                </div>
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-white bg-heritage-green flex items-center justify-center text-[10px] font-black text-white">
                 +82
              </div>
           </div>
           <p className="text-[10px] text-slate-400 font-bold uppercase self-center ml-4">Users helped today</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Interface */}
        <div className="md:col-span-2 space-y-8">
          <AnimatePresence mode="wait">
            {stage === 0 && (
              <motion.div 
                key="start"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-12 bg-white rounded-[3rem] border border-slate-200 shadow-xl text-center space-y-8"
              >
                <div className="w-20 h-20 bg-heritage-green/5 rounded-full flex items-center justify-center text-heritage-green mx-auto">
                   <HelpCircle className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                   <h2 className="text-2xl heading-serif text-heritage-green">Describe your legal situation</h2>
                   <p className="text-sm text-slate-500 max-w-md mx-auto">We'll provide a clear explanation and guide you to the right solution.</p>
                </div>
                <div className="w-full max-w-xl mx-auto">
                   <textarea 
                     placeholder="Example: 'My employer hasn't paid my salary for 2 months...'" 
                     className="w-full bg-slate-50 border-none rounded-3xl p-8 text-sm outline-none focus:ring-1 focus:ring-heritage-green h-48 shadow-inner"
                   />
                </div>
                <button 
                  onClick={() => setStage(1)}
                  className="px-12 py-4 bg-heritage-green text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
                >
                  Start Legal GPS
                </button>
              </motion.div>
            )}

            {stage >= 1 && (
              <motion.div 
                key="guide"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                {/* Progress Breadcrumbs */}
                <div className="flex justify-between px-10">
                   {steps.map((s, i) => (
                     <div key={i} className={`flex flex-col items-center gap-2 ${stage > i ? 'text-heritage-green' : 'text-slate-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${stage > i ? 'border-heritage-green bg-heritage-green/5' : 'border-slate-100'}`}>
                           <s.icon className="w-5 h-5" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest">{s.title}</span>
                     </div>
                   ))}
                </div>

                <div className="p-10 bg-white border border-slate-200 rounded-[3rem] shadow-xl space-y-8">
                   {stage === 1 && (
                     <div className="space-y-6">
                        <h3 className="text-xl font-bold text-heritage-green">Stage 1: Simple Explanation</h3>
                        <div className="p-8 bg-paper-white rounded-[2rem] border border-slate-100 text-sm text-slate-600 leading-relaxed font-medium">
                           "According to the **Cameroon Labor Code**, non-payment of salary is a breach of contract. You have the right to demand payment and potentially seek damages for delay. Under OHADA commercial rules, if this is a business debt, specific summary procedures apply."
                        </div>
                        <button onClick={() => setStage(2)} className="btn-classic text-xs">Analyze My Risks</button>
                     </div>
                   )}

                   {stage === 2 && (
                     <div className="space-y-6">
                        <div className="flex items-center gap-4 text-orange-600">
                           <AlertCircle className="w-8 h-8" />
                           <h3 className="text-xl font-bold">Stage 2: Risk Awareness</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="p-6 bg-red-50 border border-red-100 rounded-3xl space-y-2">
                              <p className="text-xs font-black text-red-600 uppercase tracking-widest">Prescription Risk</p>
                              <p className="text-sm font-bold text-red-900">You may lose your claim if you don't file within 30 days.</p>
                           </div>
                           <div className="p-6 bg-orange-50 border border-orange-100 rounded-3xl space-y-2">
                              <p className="text-xs font-black text-orange-600 uppercase tracking-widest">Procedural Complexity</p>
                              <p className="text-sm font-bold text-orange-900">Formal 'Mise en Demeure' is required before court action.</p>
                           </div>
                        </div>
                        <p className="text-xs text-slate-500 italic">"This matter is classified as **Medium Complexity**. Professional representation is strongly recommended to protect your interests."</p>
                        <button onClick={() => setStage(3)} className="px-10 py-4 bg-heritage-green text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg">Take Guided Action</button>
                     </div>
                   )}

                   {stage === 3 && (
                     <div className="space-y-8">
                        <h3 className="text-xl font-bold text-heritage-green">Stage 3: Professional Action</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div className="p-8 bg-paper-white border border-slate-200 rounded-[2rem] space-y-4 group hover:border-heritage-green transition-all">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-heritage-green shadow-sm">
                                 <FileText className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-bold">Generate Draft Complaint</h4>
                              <p className="text-[10px] text-slate-400">System creates a preliminary draft to save your lawyer hours of work.</p>
                              <div className="flex items-center gap-2 text-heritage-green">
                                 <Lock className="w-3 h-3" />
                                 <span className="text-[9px] font-black uppercase">Validation Required</span>
                              </div>
                           </div>

                           <div className="p-8 bg-heritage-green text-white rounded-[2rem] space-y-4 shadow-xl group hover:scale-[1.02] transition-all cursor-pointer">
                              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-white/10">
                                 <UserCheck className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-bold">Connect with Verified Lawyer</h4>
                              <p className="text-[10px] opacity-70">Instantly route your case to a TSIDEK-certified firm in your area.</p>
                              <ChevronRight className="w-4 h-4 translate-x-0 group-hover:translate-x-2 transition-all" />
                           </div>
                        </div>
                     </div>
                   )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
           <div className="p-8 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <ShieldCheck className="w-32 h-32" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Ethics & Trust</h3>
              <p className="text-sm opacity-70 leading-relaxed font-medium">
                 The TSIDEK App is an educational assistant. It provides awareness and helps you prepare, but it is **not a substitute for a lawyer**.
              </p>
              <div className="pt-4 border-t border-white/10">
                 <p className="text-[10px] font-black uppercase text-emerald-400">All data processed locally via TSIDEK Intelligence.</p>
              </div>
           </div>

           <div className="p-8 bg-paper-white border border-slate-200 rounded-[3rem] space-y-4 shadow-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-heritage-green mb-2">
                 <Landmark className="w-8 h-8" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest">TSIDEK Legal Network</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                 By using this app, you gain access to the collective intelligence of the most prestigious law firms in Africa.
              </p>
           </div>
        </div>
      </div>
    </section>
  );
}

function Lock({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  )
}
