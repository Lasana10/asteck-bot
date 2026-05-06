"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Search, Book, Bookmark, Scale, Landmark, ChevronRight } from 'lucide-react';

export default function PanAfricanLaw() {
  const [activeRegion, setActiveRegion] = useState('Central Africa (OHADA)');

  const jurisdictions = [
    { name: 'Nigeria', field: 'Common Law', topics: ['Company Law', 'Evidence Act', 'Criminal Code'] },
    { name: 'Kenya', field: 'Civil & Common', topics: ['Land Law', 'Commercial Contracts', 'Constitution'] },
    { name: 'South Africa', field: 'Roman-Dutch', topics: ['Constitutional Law', 'IP Rights', 'Labor Law'] },
    { name: 'Cameroon', field: 'OHADA/Bilingual', topics: ['Recovery Procedures', 'Transport Law', 'Arbitration'] }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Pan-African Procedural Bible</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Comprehensive Law & Jurisdictions • Step-by-Step Guides</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
           {['Central', 'Western', 'Eastern', 'Southern'].map(r => (
             <button 
               key={r}
               onClick={() => setActiveRegion(r)}
               className={`px-4 py-2 rounded text-[10px] font-black uppercase transition-all ${
                 activeRegion.includes(r) ? 'bg-white text-heritage-green shadow-sm' : 'text-slate-400'
               }`}
             >
               {r}
             </button>
           ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search African laws, acts, or procedures..." 
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm outline-none focus:ring-1 focus:ring-heritage-green transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-8">
        <div className="space-y-6">
           <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Jurisdictions</h3>
           <div className="space-y-2">
              {jurisdictions.map((j, i) => (
                <div key={i} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-heritage-green cursor-pointer transition-all group">
                   <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">{j.name}</span>
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-heritage-green transition-all" />
                   </div>
                   <p className="text-[10px] text-slate-400 uppercase font-black mt-1">{j.field}</p>
                </div>
              ))}
           </div>
        </div>

        <div className="md:col-span-3 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-10 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-10">
                    <Globe className="w-40 h-40" />
                 </div>
                 <h3 className="text-2xl heading-serif leading-tight">Mastering <span className="text-emerald-400">Cross-Border</span> Law</h3>
                 <p className="text-sm opacity-70 leading-relaxed">
                    TSIDEK Intelligence provides instant comparative analysis between OHADA Uniform Acts and Commonwealth legal frameworks.
                 </p>
                 <button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-400 group">
                    Explore Regional Treaties <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-all" />
                 </button>
              </div>

              <div className="p-10 bg-paper-white border border-slate-200 rounded-[3rem] space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-heritage-green rounded-2xl flex items-center justify-center text-white">
                       <Landmark className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-heritage-green">Step-by-Step Guides</h4>
                 </div>
                 <div className="space-y-4">
                    {[
                      "Company Incorporation in Nigeria (CAC)",
                      "Arbitration Enforcement in South Africa",
                      "Recovery of Debt (AUPSRVE) in Senegal"
                    ].map((guide, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-100 group hover:border-heritage-green cursor-pointer transition-all shadow-sm">
                         <span className="text-xs font-bold text-slate-700">{guide}</span>
                         <Book className="w-4 h-4 text-slate-200 group-hover:text-heritage-green" />
                      </div>
                    ))}
                 </div>
              </div>
           </div>

           <div className="card-heritage p-8 bg-white border border-slate-200 rounded-[3rem] shadow-sm flex items-center gap-8">
              <div className="w-16 h-16 bg-heritage-green/5 rounded-2xl flex items-center justify-center text-heritage-green shrink-0">
                 <Scale className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                 <h4 className="text-sm font-bold text-heritage-green uppercase tracking-widest">TSIDEK Legal Synthesis Active</h4>
                 <p className="text-xs text-slate-600">Our knowledge base now covers all 54 African nations. All procedural timelines are updated weekly by the **Sovereign Node** local synchronization.</p>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}
