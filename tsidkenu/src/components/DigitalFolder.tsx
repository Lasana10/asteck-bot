"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Folder, CheckCircle, Clock, ExternalLink, Download, ChevronRight } from 'lucide-react';

export default function DigitalFolder() {
  const [timeline, setTimeline] = React.useState([
    { event: "Contextual Autofill Complete", time: "10:30 AM", status: "Done" },
    { event: "Template Verification", time: "09:15 AM", status: "Done" },
    { event: "Matter Initialized", time: "Yesterday", status: "Done" }
  ]);

  const caseMetadata = {
    title: "Assignation en Paiement - Société Maritime X",
    client: "Bolloré Transport & Logistics",
    matterId: "CM-2024-089",
    status: "Active / Court Filing",
    rate: "150,000 XAF / hr"
  };

  const handleContextualize = () => {
    // In production, this calls the OpenClaw smart_autofill and OneDrive mirror logic
    const newEntry = { event: "OneDrive Mirror Complete", time: "Just now", status: "Done" };
    setTimeline([newEntry, ...timeline]);
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      {/* Header Info */}
      <div className="flex justify-between items-start border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-heritage-green">
            <Folder className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono">MATTER_CORE</span>
          </div>
          <h1 className="text-3xl heading-serif leading-tight max-w-2xl">
            {caseMetadata.title}
          </h1>
          <p className="text-sm text-slate-500 font-medium">{caseMetadata.client} • {caseMetadata.matterId}</p>
        </div>
        <div className="text-right space-y-2">
          <span className="inline-block px-3 py-1 bg-heritage-green/5 text-heritage-green text-[10px] font-bold rounded-full border border-heritage-green/10">
            {caseMetadata.status}
          </span>
          <p className="text-xl font-bold text-heritage-green">{caseMetadata.rate}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Document Stack */}
        <div className="md:col-span-2 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Legal Documentation Stack
          </h3>
          <div className="space-y-4">
            {documentStack.map((doc, i) => (
              <div key={i} className="card-heritage p-6 rounded-lg flex justify-between items-center group cursor-pointer">
                <div className="flex gap-4 items-center">
                  <div className="w-10 h-10 bg-paper-white border border-slate-200 rounded flex items-center justify-center group-hover:border-heritage-green transition-colors">
                    <FileText className="w-5 h-5 text-heritage-green opacity-70" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-heritage-green">{doc.title}</h4>
                    <p className="text-[10px] text-slate-400 uppercase">{doc.type} • Updated {doc.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${doc.status === 'Ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                    {doc.status}
                  </span>
                  <button className="p-2 hover:bg-heritage-green hover:text-white rounded transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full py-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 font-bold text-xs hover:border-heritage-green hover:text-heritage-green transition-all uppercase tracking-widest flex items-center justify-center gap-2">
             + Upload Case Evidence or Pièces
          </button>
        </div>

        {/* Sidebar Status / Actions */}
        <div className="space-y-8">
          <div className="glass p-6 rounded-lg space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-heritage-green">TSIDKENU Activity</h3>
            <div className="space-y-4">
              {timeline.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1">
                    <CheckCircle className="w-3.5 h-3.5 text-heritage-green" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">{step.event}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{step.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-classic w-full text-xs flex items-center justify-center gap-2">
              Sync to OneDrive <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="p-6 bg-heritage-green text-paper-white rounded-lg space-y-4 shadow-xl">
             <h4 className="text-sm font-bold heading-serif text-white">Perform Smart Autofill</h4>
             <p className="text-[10px] opacity-70 leading-relaxed">
               Uses your pre-made heritage templates. TSIDKENU will instantly contextualize case details into a perfect court-ready draft.
             </p>
             <button 
               onClick={handleContextualize}
               className="w-full py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
             >
               Run Contextualization
             </button>
          </div>
        </div>
      </div>
    </section>
  );
}
