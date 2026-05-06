"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Network, Users, TrendingUp, Zap, Target, Briefcase } from 'lucide-react';

export default function GrowthNetwork() {
  const teamAutonomy = [
    { name: 'Associate A', score: 85, tasksCompleted: 124, expertise: 'Litigation' },
    { name: 'Associate B', score: 92, tasksCompleted: 210, expertise: 'Corporate' },
    { name: 'Paralegal C', score: 78, tasksCompleted: 450, expertise: 'Procedural' }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Growth Network</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Team Autonomy Tracking • Human-System Synergy</p>
        </div>
        <div className="flex gap-4">
          <button className="btn-classic text-xs">Assign New Protocol</button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-8">
        {/* Core Stats */}
        <div className="md:col-span-1 space-y-6">
          <div className="p-6 bg-heritage-green text-white rounded-lg shadow-xl space-y-4">
             <div className="flex items-center gap-2">
               <TrendingUp className="w-5 h-5 opacity-50" />
               <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Firm Velocity</span>
             </div>
             <h2 className="text-4xl font-black">+24%</h2>
             <p className="text-[10px] opacity-60 uppercase font-bold tracking-tight">Increase in procedural efficiency</p>
          </div>
          <div className="p-6 bg-white border border-slate-200 rounded-lg space-y-4">
             <div className="flex items-center gap-2 text-heritage-green">
               <Target className="w-5 h-5 opacity-50" />
               <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Client Retention</span>
             </div>
             <h2 className="text-4xl font-black text-heritage-green">98.4%</h2>
             <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Active Case Lifecycle Score</p>
          </div>
        </div>

        {/* Team Autonomy Grid */}
        <div className="md:col-span-3 space-y-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Operational Autonomy Scores
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {teamAutonomy.map((member, i) => (
              <div key={i} className="card-heritage p-6 rounded-lg bg-white border border-slate-200 flex flex-col justify-between group hover:border-heritage-green transition-all">
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-paper-white rounded flex items-center justify-center border border-slate-100">
                      <Briefcase className="w-5 h-5 text-heritage-green opacity-50" />
                    </div>
                    <span className="text-[10px] font-black text-heritage-green bg-heritage-green/5 px-2 py-1 rounded">
                      {member.expertise}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-heritage-green">{member.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase">{member.tasksCompleted} Tasks Verified</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span>Autonomy Level</span>
                      <span>{member.score}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${member.score}%` }}
                        transition={{ duration: 1, delay: i * 0.2 }}
                        className="h-full bg-heritage-green" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-8 bg-slate-50 border border-slate-200 rounded-lg flex gap-8 items-center">
             <div className="w-16 h-16 rounded-full bg-white border-4 border-heritage-green flex items-center justify-center shrink-0">
                <Zap className="w-8 h-8 text-heritage-green" />
             </div>
             <div className="space-y-1">
                <h4 className="text-sm font-bold text-heritage-green uppercase tracking-widest">TSIDKENU Neural Bridge Active</h4>
                <p className="text-xs text-slate-600">The system is currently synchronizing local OHADA knowledge across all team devices. No internet required for core intelligence availability.</p>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
