"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Briefcase, ChevronRight, AlertCircle, Clock, User } from 'lucide-react';

export default function CaseLedger() {
  const cases = [
    { id: "CM-2024-089", title: "Maritime Debt Recovery", client: "Bolloré Logistics", status: "Active", urgency: "High", partner: "Me. Tsidkenu" },
    { id: "CM-2024-042", title: "IP Infringement - Logo", client: "Fintech Hub", status: "Pending", urgency: "Medium", partner: "Me. Eboa" },
    { id: "CM-2024-015", title: "Labor Dispute - Dismissal", client: "Afriland First Bank", status: "Closed", urgency: "Low", partner: "Me. Tsidkenu" },
    { id: "CM-2024-112", title: "Corporate Restructuring", client: "Eneo Cameroon", status: "Drafting", urgency: "High", partner: "Me. Njoh" }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <h1 className="text-3xl heading-serif text-heritage-green">The Master Ledger</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Comprehensive Case Inventory • OHADA Jurisdiction</p>
          </div>
          <button className="btn-classic text-xs">+ Open New Matter</button>
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by case number, client, or legal keyword..." 
              className="w-full bg-white border border-slate-200 rounded-lg py-3 pl-12 pr-4 text-sm outline-none focus:ring-1 focus:ring-heritage-green transition-all"
            />
          </div>
          <button className="px-6 py-2 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2 hover:bg-slate-50 transition-all">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      <div className="card-heritage bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Case Reference</th>
              <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Matter Title / Client</th>
              <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Priority</th>
              <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Responsible Partner</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-heritage-green/5 transition-all cursor-pointer group">
                <td className="p-4">
                  <span className="text-xs font-mono font-bold text-heritage-green bg-heritage-green/5 px-2 py-1 rounded">
                    {c.id}
                  </span>
                </td>
                <td className="p-4">
                  <h4 className="text-sm font-bold text-heritage-green">{c.title}</h4>
                  <p className="text-[10px] text-slate-400 uppercase font-medium">{c.client}</p>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${c.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-xs font-medium text-slate-600">{c.status}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    c.urgency === 'High' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {c.urgency}
                  </span>
                </td>
                <td className="p-4 text-xs font-medium text-slate-600 flex items-center gap-2">
                   <User className="w-3.5 h-3.5 opacity-40" />
                   {c.partner}
                </td>
                <td className="p-4 text-right">
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 group-hover:text-heritage-green transition-all" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <div className="p-6 bg-paper-white border border-slate-200 rounded-lg flex items-center gap-4">
           <div className="w-12 h-12 rounded bg-heritage-green/5 flex items-center justify-center">
             <AlertCircle className="w-6 h-6 text-heritage-green" />
           </div>
           <div>
             <p className="text-2xl font-black text-heritage-green">14</p>
             <p className="text-[10px] text-slate-500 uppercase font-bold">Unresolved Conflicts</p>
           </div>
        </div>
        <div className="p-6 bg-paper-white border border-slate-200 rounded-lg flex items-center gap-4">
           <div className="w-12 h-12 rounded bg-heritage-green/5 flex items-center justify-center">
             <Clock className="w-6 h-6 text-heritage-green" />
           </div>
           <div>
             <p className="text-2xl font-black text-heritage-green">08</p>
             <p className="text-[10px] text-slate-500 uppercase font-bold">Upcoming Deadlines</p>
           </div>
        </div>
        <div className="p-6 bg-heritage-green text-white rounded-lg flex items-center justify-center gap-4 shadow-lg">
           <Briefcase className="w-6 h-6 opacity-50" />
           <p className="text-xs font-bold uppercase tracking-widest">Generate Quarterly Firm Report</p>
        </div>
      </div>
    </section>
  );
}
