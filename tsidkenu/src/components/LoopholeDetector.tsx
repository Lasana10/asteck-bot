"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertTriangle, FileSearch, CheckCircle2, Search, Zap } from 'lucide-react';

export default function LoopholeDetector() {
  const [pass, setPass] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = () => {
    setAnalyzing(true);
    let currentPass = 0;
    const interval = setInterval(() => {
      currentPass += 1;
      setPass(currentPass);
      if (currentPass === 3) {
        clearInterval(interval);
        setAnalyzing(false);
      }
    }, 2000);
  };

  const findings = [
    { type: 'Critical', issue: 'Arbitration Clause Ambiguity', fix: 'Specify CCJA (OHADA) as the seat of arbitration.' },
    { type: 'Warning', issue: 'Indemnity Cap Missing', fix: 'Insert a cap equal to 100% of the contract value.' },
    { type: 'Secure', issue: 'Force Majeure', fix: 'Properly covers CEMAC regional risks.' }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Loophole Detector</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">3-Pass Professional Contract Review • OHADA Standard</p>
        </div>
        <button 
          onClick={runAnalysis}
          disabled={analyzing}
          className={`px-8 py-3 rounded font-black text-xs uppercase tracking-widest transition-all ${
            analyzing ? 'bg-slate-100 text-slate-400' : 'bg-heritage-green text-white shadow-lg hover:scale-105'
          }`}
        >
          {analyzing ? `Executing Pass ${pass}...` : 'Start 3-Pass Review'}
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Pass Progress */}
        <div className="space-y-6">
          <div className={`p-6 rounded-lg border transition-all ${pass >= 1 ? 'border-heritage-green bg-heritage-green/5' : 'border-slate-100 opacity-50'}`}>
            <h4 className="text-xs font-bold uppercase mb-2 flex items-center gap-2">
              <Search className="w-4 h-4" /> Pass 1: Structural Audit
            </h4>
            <p className="text-[10px] text-slate-500">Checking for missing essential clauses and legal validities.</p>
          </div>
          <div className={`p-6 rounded-lg border transition-all ${pass >= 2 ? 'border-heritage-green bg-heritage-green/5' : 'border-slate-100 opacity-50'}`}>
            <h4 className="text-xs font-bold uppercase mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Pass 2: Conflict Intelligence
            </h4>
            <p className="text-[10px] text-slate-500">Comparing against 10,000+ regional court rulings and precedents.</p>
          </div>
          <div className={`p-6 rounded-lg border transition-all ${pass >= 3 ? 'border-heritage-green bg-heritage-green/5' : 'border-slate-100 opacity-50'}`}>
            <h4 className="text-xs font-bold uppercase mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Pass 3: Risk Mitigation
            </h4>
            <p className="text-[10px] text-slate-500">Final synthesis and generation of surgical corrections.</p>
          </div>
        </div>

        {/* Results / Findings */}
        <div className="md:col-span-2">
          <AnimatePresence>
            {!analyzing && pass === 3 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Analysis Results</h3>
                <div className="space-y-4">
                  {findings.map((finding, i) => (
                    <div key={i} className="card-heritage p-6 rounded-lg bg-white border border-slate-200 flex gap-6">
                      <div className={`w-12 h-12 rounded flex items-center justify-center shrink-0 ${
                        finding.type === 'Critical' ? 'bg-red-50 text-red-600' : 
                        finding.type === 'Warning' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {finding.type === 'Critical' ? <AlertTriangle className="w-6 h-6" /> : 
                         finding.type === 'Warning' ? <FileSearch className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                            finding.type === 'Critical' ? 'bg-red-600 text-white' : 
                            finding.type === 'Warning' ? 'bg-orange-500 text-white' : 'bg-emerald-500 text-white'
                          }`}>{finding.type}</span>
                          <h4 className="text-sm font-bold text-heritage-green">{finding.issue}</h4>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">{finding.fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="h-64 border-2 border-dashed border-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-300 space-y-4">
                <FileSearch className={`w-12 h-12 ${analyzing ? 'animate-pulse' : ''}`} />
                <p className="text-xs font-bold uppercase tracking-widest">
                  {analyzing ? 'Intelligence Engine at Work...' : 'Awaiting Document Upload'}
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
