"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Scale, FileText, Landmark, ChevronRight, Bookmark } from 'lucide-react';

export default function ProcedureGuide() {
  const procedures = [
    { 
      title: "Recouvrement de Créances", 
      act: "AUPSRVE", 
      steps: 12, 
      complexity: "Medium",
      desc: "Uniform Act organizing simplified recovery procedures and enforcement measures."
    },
    { 
      title: "Droit des Sociétés (SA/SARL)", 
      act: "AUSCGIE", 
      steps: 8, 
      complexity: "High",
      desc: "Uniform Act on Commercial Companies and Economic Interest Groups."
    },
    { 
      title: "Sûretés & Garanties", 
      act: "AUS", 
      steps: 5, 
      complexity: "Low",
      desc: "Uniform Act Organizing Securities."
    }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">The OHADA Procedure Bible</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Standardized Procedural Knowledge • Jurisdictional Source of Truth</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {procedures.map((proc, i) => (
          <div key={i} className="card-heritage p-8 rounded-3xl bg-white border border-slate-200 flex flex-col justify-between group hover:border-heritage-green transition-all shadow-sm">
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-heritage-green/5 rounded-2xl flex items-center justify-center text-heritage-green">
                  <Landmark className="w-6 h-6" />
                </div>
                <Bookmark className="w-5 h-5 text-slate-200 group-hover:text-heritage-green transition-colors cursor-pointer" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                   <span className="text-[9px] font-black uppercase bg-heritage-green text-white px-2 py-0.5 rounded-full">{proc.act}</span>
                   <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                     proc.complexity === 'High' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
                   }`}>{proc.complexity} Complexity</span>
                </div>
                <h3 className="text-xl font-bold text-heritage-green leading-tight">{proc.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">{proc.desc}</p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase">{proc.steps} Procedural Steps</span>
              <button className="p-2 bg-slate-50 rounded-full group-hover:bg-heritage-green group-hover:text-white transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
         <div className="p-10 bg-slate-900 rounded-[3rem] text-white space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-10">
               <Scale className="w-40 h-40" />
            </div>
            <h2 className="text-2xl heading-serif leading-tight">Mastering <span className="text-emerald-400">Jurisdictional Deadlines</span></h2>
            <p className="text-sm opacity-70 leading-relaxed max-w-md">
              TSIDKENU synchronizes the OHADA calendar across 17 member states. It accounts for local public holidays, procedural 'franc' rules, and court recess periods.
            </p>
            <button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-400 hover:gap-4 transition-all">
              View Detailed Timeline Rules <ChevronRight className="w-4 h-4" />
            </button>
         </div>

         <div className="p-10 bg-paper-white border border-slate-200 rounded-[3rem] space-y-8 flex flex-col justify-center">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-heritage-green rounded-2xl flex items-center justify-center text-white">
                  <FileText className="w-6 h-6" />
               </div>
               <h4 className="text-lg font-bold text-heritage-green">Smart Drafting Hints</h4>
            </div>
            <ul className="space-y-4">
               {[
                 "Always verify the seat of the CCJA for international arbitration.",
                 "Ensure 'Exploit d'Huissier' contains all mandatory mentions under Art. 4 AUPSRVE.",
                 "Bilingual mandates must be certified by a sworn translator for CEMAC use."
               ].map((tip, i) => (
                 <li key={i} className="flex gap-3 text-xs text-slate-600 font-medium leading-relaxed">
                    <span className="text-heritage-green font-black">0{i+1}</span>
                    {tip}
                 </li>
               ))}
            </ul>
         </div>
      </div>
    </section>
  );
}
