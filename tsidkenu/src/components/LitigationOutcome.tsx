"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Target, Scale, Info, Landmark, AlertTriangle, BarChart3, ChevronRight } from 'lucide-react';

export default function LitigationOutcome() {
  const [analyzing, setAnalyzing] = useState(false);
  const [prediction, setPrediction] = useState<any>(null);

  const runPrediction = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setPrediction({
        winProbability: 74,
        estimatedDamages: '45,000,000 - 60,000,000 XAF',
        judgeTendency: 'Pro-Plaintiff (82% in Commercial Debt)',
        courtEfficiency: 'Douala TGI (Avg. 14 months to judgment)',
        riskFactors: [
          'Jurisdictional challenge likely by defense',
          'Documentary evidence No. 3 requires stronger certification'
        ]
      });
      setAnalyzing(false);
    }, 3000);
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Litigation Outcome Engine</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Predictive Intelligence • Strategy Dominance</p>
        </div>
        <button 
          onClick={runPrediction}
          disabled={analyzing}
          className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
            analyzing ? 'bg-slate-100 text-slate-400' : 'bg-heritage-green text-white shadow-lg hover:scale-105'
          }`}
        >
          {analyzing ? 'Synthesizing Precedents...' : 'Run Prediction Engine'}
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Core Predictions */}
        <div className="md:col-span-2 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-10 bg-white border border-slate-200 rounded-[3rem] shadow-xl space-y-6 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-5">
                    <TrendingUp className="w-32 h-32 text-heritage-green" />
                 </div>
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Win Probability</h3>
                 <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-heritage-green">{prediction?.winProbability || '--'}%</span>
                    <span className="text-xs font-bold text-emerald-600 uppercase">High Confidence</span>
                 </div>
                 <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                    <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${prediction?.winProbability || 0}%` }}
                       transition={{ duration: 2 }}
                       className="h-full bg-heritage-green"
                    />
                 </div>
              </div>

              <div className="p-10 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl overflow-hidden relative">
                 <div className="absolute top-0 right-0 p-8 opacity-10 text-emerald-400">
                    <Scale className="w-32 h-32" />
                 </div>
                 <h3 className="text-xs font-black uppercase tracking-widest opacity-60">Est. Damages Award</h3>
                 <h2 className="text-2xl font-black text-emerald-400 leading-tight">
                    {prediction?.estimatedDamages || 'Select Case Parameters'}
                 </h2>
                 <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest">Based on 450+ similar rulings in Littoral region</p>
              </div>
           </div>

           {/* Detailed Strategy Breakdown */}
           <div className="card-heritage p-10 bg-white rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-heritage-green flex items-center gap-2">
                 <BarChart3 className="w-5 h-5" /> Strategic Decision Matrix
              </h3>
              <div className="space-y-6">
                 {prediction?.riskFactors.map((risk: string, i: number) => (
                    <div key={i} className="flex gap-4 p-5 bg-paper-white rounded-3xl border border-slate-100 items-start group hover:border-heritage-green transition-all">
                       <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                       <div>
                          <p className="text-xs font-bold text-slate-700">{risk}</p>
                          <button className="text-[10px] font-black text-heritage-green uppercase mt-2 flex items-center gap-1 group-hover:gap-2 transition-all">
                             View Correction Strategy <ChevronRight className="w-3 h-3" />
                          </button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Court & Judge Intelligence */}
        <div className="space-y-8">
           <div className="p-8 bg-paper-white border border-slate-200 rounded-[3rem] space-y-6 shadow-sm">
              <div className="flex items-center gap-3 text-heritage-green">
                 <Landmark className="w-5 h-5" />
                 <h4 className="text-xs font-black uppercase tracking-widest">Court Intelligence</h4>
              </div>
              <div className="space-y-4">
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Target Jurisdiction</p>
                    <p className="text-sm font-bold text-slate-700">TGI Douala - Commercial Chamber</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Avg. Timeline</p>
                    <p className="text-sm font-bold text-heritage-green">14.2 Months to Verdict</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Procedural Strictness</p>
                    <p className="text-sm font-bold text-orange-600">High (8.5/10)</p>
                 </div>
              </div>
           </div>

           <div className="p-8 bg-heritage-green text-white rounded-[3rem] space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                 <Target className="w-5 h-5 opacity-50" />
                 <h4 className="text-sm font-bold heading-serif">TSIDEK Strategic Advice</h4>
              </div>
              <p className="text-[10px] opacity-70 leading-relaxed italic">
                 "Given the high pro-plaintiff tendency of this chamber in debt recovery, we recommend accelerating the 'Mise en État' phase to secure a judgment within 12 months. Ensure all Huissier significations are impeccably served."
              </p>
           </div>
        </div>
      </div>
    </section>
  );
}
