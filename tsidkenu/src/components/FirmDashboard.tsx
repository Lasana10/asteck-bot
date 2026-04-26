"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, CreditCard, Users, TrendingUp, ShieldAlert, Award, Activity } from 'lucide-react';

export default function FirmDashboard() {
  const stats = [
    { label: "Active Matters", value: "24", sub: "+3 this month", icon: Briefcase, color: "text-blue-400" },
    { label: "Recovery Rate", value: "92%", sub: "Above average", icon: TrendingUp, color: "text-emerald-400" },
    { label: "Team Capacity", value: "78%", sub: "High utilization", icon: Users, color: "text-orange-400" }
  ];

  const matters = [
    { title: "Commercial Lease Dispute", party: "Société X vs Landlord Y", status: "Ongoing", risk: "Low" },
    { title: "Employment Retainer", party: "Fintech Startup Z", status: "Compliance Check", risk: "High" },
    { title: "Property Acquisition", party: "Developer W", status: "Contract Drafting", risk: "Medium" }
  ];

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg border border-slate-200 mb-12 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-heritage-green rounded shadow-lg">
            <Award className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-heritage-green uppercase tracking-tight heading-serif">TSIDKENU FirmOS</h2>
            <p className="text-[10px] text-slate-400 font-mono">OPERATIONAL ENGINE • LIVE_MONITORING</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Efficiency Status</p>
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
               <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} className="h-full bg-heritage-green" />
            </div>
            <span className="text-xs font-bold text-heritage-green">85%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((s, i) => (
          <motion.div 
            whileHover={{ y: -5 }} 
            key={i} 
            className="card-heritage p-8 rounded-lg group cursor-pointer border border-slate-200 bg-white"
          >
            <div className="flex justify-between items-start mb-6">
              <div className={`p-4 rounded bg-slate-50 group-hover:bg-heritage-green/5 transition-all`}>
                <s.icon className={`w-6 h-6 text-heritage-green`} />
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">SYSTEM_METRIC</p>
            </div>
            <div className="space-y-1">
              <h3 className="text-4xl font-black text-heritage-green">{s.value}</h3>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
            </div>
            <p className={`text-[10px] mt-4 font-bold bg-heritage-green/5 text-heritage-green px-2 py-1 rounded inline-block`}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="card-heritage p-8 rounded-lg space-y-6 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-heritage-green">
              <Briefcase className="w-5 h-5" />
              Matter Ledger
            </h3>
            <button className="text-[10px] font-bold text-slate-400 hover:text-heritage-green transition-all uppercase tracking-tighter">View All</button>
          </div>
          <div className="space-y-4">
            {matters.map((m, i) => (
              <div key={i} className="p-4 rounded border border-slate-100 hover:border-heritage-green/30 transition-all flex justify-between items-center group">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-700 group-hover:text-heritage-green transition-colors">{m.title}</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{m.party} • {m.status}</p>
                </div>
                <div className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${m.risk === 'High' ? 'border-red-200 text-red-600 bg-red-50' : 'border-slate-100 text-slate-400'}`}>
                  {m.risk} Risk
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-heritage p-8 rounded-lg space-y-8 relative overflow-hidden bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold flex items-center gap-2 text-heritage-green">
              <CreditCard className="w-5 h-5" />
              Financial Pulse
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Live Tracking</span>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-lg border border-slate-200">
               <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Projected Revenue Q2</p>
               <h4 className="text-3xl font-black text-heritage-green">45,200,000 XAF</h4>
               <div className="flex items-center gap-2 mt-4 text-[10px]">
                 <TrendingUp className="w-3 h-3 text-emerald-600" />
                 <span className="text-emerald-600 font-bold">+12.4% vs Q1</span>
               </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded bg-white border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Awaiting</p>
                <h5 className="text-lg font-bold text-slate-700">12,450k</h5>
              </div>
              <div className="p-4 rounded bg-white border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Recovered</p>
                <h5 className="text-lg font-bold text-slate-700">32,750k</h5>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Activity Log */}
      <div className="card-heritage p-8 rounded-lg mt-8 bg-white">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-heritage-green/5 rounded">
               <Activity className="w-5 h-5 text-heritage-green" />
             </div>
             <div>
               <h3 className="text-lg font-bold text-heritage-green">Firm Operational Logs</h3>
               <p className="text-[10px] text-slate-400 uppercase tracking-widest">TSIDKENU Execution History</p>
             </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-heritage-green/5 rounded-full border border-heritage-green/10">
            <div className="w-2 h-2 rounded-full bg-heritage-green animate-pulse" />
            <span className="text-[10px] font-bold text-heritage-green uppercase tracking-widest">System Active</span>
          </div>
        </div>
        
        <div className="space-y-4 bg-paper-white p-6 rounded border border-slate-200 h-56 overflow-y-auto font-mono text-xs">
          <div className="flex gap-4 items-start text-slate-500">
             <span className="text-heritage-green/50 w-20 shrink-0">14:02:11</span>
             <span>[SYSTEM] Connecting to Lawyer OneDrive Graph API...</span>
          </div>
          <div className="flex gap-4 items-start text-slate-500">
             <span className="text-heritage-green/50 w-20 shrink-0">14:02:14</span>
             <span>[SKILL: scan_onedrive] Scanned 14 documents. Found 2 requiring audit.</span>
          </div>
          <div className="flex gap-4 items-start text-slate-700">
             <span className="text-heritage-green/50 w-20 shrink-0">14:02:15</span>
             <span>[SKILL: audit_compliance] Examining [MTN_Fintech_Licensing.pdf]</span>
          </div>
          <div className="flex gap-4 items-start text-red-600 bg-red-50 p-2 rounded border border-red-100">
             <span className="text-red-400/50 w-20 shrink-0 text-[10px] mt-0.5">14:02:18</span>
             <span>⚠️ Violation Detected: Missing Article 14 clearance. Action: Drafted alert for review.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
