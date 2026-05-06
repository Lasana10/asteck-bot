"use client"
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Square, Save, Calendar, History, TrendingUp } from 'lucide-react';

export default function BillableTimer() {
  const [time, setTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [rate] = useState(150000); // 150k XAF / hr

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setTime(time => time + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
  };

  const calculateFees = () => {
    return ((time / 3600) * rate).toLocaleString() + " XAF";
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Billable Pulse</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Real-Time Time Tracking • Professional Fee Accuracy</p>
        </div>
        <div className="flex gap-4">
          <button className="btn-classic text-xs flex items-center gap-2">
            <History className="w-4 h-4" /> View Full Timesheet
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* The Active Timer */}
        <div className="md:col-span-2">
          <div className="p-12 bg-white rounded-[3rem] border border-slate-200 shadow-2xl flex flex-col items-center justify-center space-y-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-heritage-green/5 opacity-20 pointer-events-none" />
            <div className="text-center space-y-2 relative z-10">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Active Session: Maritime Case</h3>
              <p className="text-sm font-bold text-heritage-green">Drafting Assignation au Fond</p>
            </div>
            
            <div className="text-8xl font-black text-heritage-green font-mono tabular-nums relative z-10">
              {formatTime(time)}
            </div>

            <div className="flex gap-6 relative z-10">
              <button 
                onClick={() => setIsActive(!isActive)}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 ${
                  isActive ? 'bg-orange-500 text-white' : 'bg-heritage-green text-white'
                }`}
              >
                {isActive ? <Square className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
              <button className="w-20 h-20 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-md hover:bg-slate-50 transition-all">
                <Save className="w-8 h-8 text-heritage-green" />
              </button>
            </div>

            <div className="pt-8 border-t border-slate-100 w-full flex justify-around text-center relative z-10">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Current Fees</p>
                <p className="text-xl font-black text-heritage-green">{calculateFees()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Hourly Rate</p>
                <p className="text-xl font-black text-heritage-green">150,000 XAF</p>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics / History */}
        <div className="space-y-8">
          <div className="glass p-8 rounded-3xl space-y-6">
            <div className="flex items-center gap-2 text-heritage-green">
              <TrendingUp className="w-5 h-5" />
              <h4 className="text-xs font-black uppercase tracking-widest">Efficiency Analytics</h4>
            </div>
            <div className="space-y-4">
               <div className="p-4 bg-white/50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Weekly Billable Target</p>
                  <p className="text-lg font-black text-heritage-green">32 / 40 Hours</p>
                  <div className="w-full h-1 bg-slate-100 rounded-full mt-2">
                    <div className="w-4/5 h-full bg-heritage-green rounded-full" />
                  </div>
               </div>
               <div className="p-4 bg-white/50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Avg. Matter Profitability</p>
                  <p className="text-lg font-black text-heritage-green">88%</p>
               </div>
            </div>
          </div>

          <div className="p-8 bg-heritage-green text-white rounded-3xl space-y-4 shadow-xl">
             <div className="flex items-center gap-2">
               <Clock className="w-5 h-5 opacity-50" />
               <h4 className="text-sm font-bold heading-serif">Automatic Billing</h4>
             </div>
             <p className="text-[10px] opacity-70 leading-relaxed">
               Every minute tracked is automatically synchronized with your **Billing & Payments** module. Invoices can be generated instantly using these logs.
             </p>
          </div>
        </div>
      </div>
    </section>
  );
}
