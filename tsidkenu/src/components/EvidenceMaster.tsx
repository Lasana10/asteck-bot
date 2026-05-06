"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { FileStack, FilePlus, Trash2, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react';

export default function EvidenceMaster() {
  const [evidence, setEvidence] = React.useState([
    { id: 1, title: 'Contract de Prêt (Original)', date: '2024-04-10', type: 'Original', status: 'Verified' },
    { id: 2, title: 'Reçu de Versement No. 889', date: '2024-04-12', type: 'Copy', status: 'Pending' },
    { id: 3, title: 'Exploit de Signification', date: '2024-04-15', type: 'Original', status: 'Verified' }
  ]);

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Bordereau de Pièces</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Evidence Master • Court-Ready Indexing</p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded font-bold text-xs hover:bg-slate-100 transition-all flex items-center gap-2">
            <FilePlus className="w-4 h-4" /> Add Evidence
          </button>
          <button className="btn-classic text-xs flex items-center gap-2 shadow-lg">
            <Download className="w-4 h-4" /> Export Formal Bordereau
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Evidence List */}
        <div className="md:col-span-2 space-y-6">
          <div className="card-heritage bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
             <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                   <tr>
                      <th className="p-4 text-[10px] font-black uppercase text-slate-400">No.</th>
                      <th className="p-4 text-[10px] font-black uppercase text-slate-400">Evidence Title</th>
                      <th className="p-4 text-[10px] font-black uppercase text-slate-400">Nature</th>
                      <th className="p-4 text-[10px] font-black uppercase text-slate-400">Status</th>
                      <th className="p-4"></th>
                   </tr>
                </thead>
                <tbody>
                   {evidence.map((item, i) => (
                     <tr key={item.id} className="border-b border-slate-50 group hover:bg-heritage-green/5 transition-all">
                        <td className="p-4 text-xs font-black text-heritage-green">0{i+1}</td>
                        <td className="p-4">
                           <p className="text-sm font-bold text-slate-700">{item.title}</p>
                           <p className="text-[10px] text-slate-400 uppercase">Received: {item.date}</p>
                        </td>
                        <td className="p-4">
                           <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${item.type === 'Original' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                             {item.type}
                           </span>
                        </td>
                        <td className="p-4">
                           <div className="flex items-center gap-2">
                              {item.status === 'Verified' ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <AlertCircle className="w-3 h-3 text-orange-400" />}
                              <span className="text-xs font-medium text-slate-600">{item.status}</span>
                           </div>
                        </td>
                        <td className="p-4 text-right">
                           <button className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </div>

        {/* Intelligence / Requirements */}
        <div className="space-y-8">
           <div className="p-8 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <FileStack className="w-32 h-32" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Evidence Intelligence</h3>
              <p className="text-lg heading-serif leading-relaxed">
                 TSIDKENU detected a <span className="text-emerald-400">Signature Mismatch</span> on Pièce No. 02.
              </p>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex gap-4 items-start">
                 <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-1" />
                 <p className="text-[11px] opacity-70 leading-relaxed">
                    Compare the bank receipt signature with the client's verified ID before filing.
                 </p>
              </div>
           </div>

           <div className="p-8 bg-paper-white border border-slate-200 rounded-[3rem] space-y-6 shadow-sm">
              <h4 className="text-sm font-bold text-heritage-green uppercase tracking-widest flex items-center gap-2">
                 <FileText className="w-4 h-4" /> OHADA Requirement
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed italic">
                 "Every document listed in the Bordereau must be communicated to the adverse party at least 48 hours before the hearing (Art. 14 AUPSRVE)."
              </p>
              <div className="w-full h-1 bg-slate-100 rounded-full">
                 <div className="w-3/4 h-full bg-orange-400 rounded-full" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase">Communication Progress: 75%</p>
           </div>
        </div>
      </div>
    </section>
  );
}
