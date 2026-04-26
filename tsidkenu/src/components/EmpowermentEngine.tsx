"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Network, Star, Target, TrendingUp, Users, Activity, ChevronRight } from 'lucide-react';

export default function EmpowermentEngine() {
  const teamGrowth = [
    { name: "Junior Associate A", role: "Litigation", autonomyScore: 88, nextMilestone: "Senior Drafter Certification" },
    { name: "Intern B", role: "Research", autonomyScore: 65, nextMilestone: "OHADA Contract Basics" },
    { name: "Senior Associate C", role: "Corporate", autonomyScore: 96, nextMilestone: "Partner Track Readiness" }
  ];

  const coordinationStream = [
    { time: "09:00 AM", event: "Associate A completed Draft. Unblocks Partner review." },
    { time: "10:30 AM", event: "Intern B finalized precedent research. Linked to Case #102." },
    { time: "11:45 AM", event: "OpenClaw scanned OneDrive. Connected compliance rule to Associate C's file." }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-black text-teal-accent flex items-center gap-4">
          <Network className="w-10 h-10" />
          Growth & Coordination Network
        </h1>
        <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
          The Empowerment Engine. World-class firms do not micromanage; they synchronize. 
          This matrix links team members, visualizes autonomy, and tracks performance progression.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Coordination Stream (Linking Workers) */}
        <div className="glass p-8 rounded-3xl space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold flex items-center gap-3">
              <Activity className="w-5 h-5 text-teal-accent" />
              Live Organizational Sync
            </h3>
            <span className="text-[10px] font-bold px-3 py-1 bg-teal-accent/10 text-teal-accent border border-teal-accent/20 rounded-full">
              OPTIMAL FLOW
            </span>
          </div>

          <div className="space-y-4 relative before:content-[''] before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-px before:bg-slate-700/50">
            {coordinationStream.map((item, i) => (
              <div key={i} className="flex gap-6 relative z-10">
                <div className="w-7 h-7 rounded-full bg-navy-900 border border-teal-accent/30 flex items-center justify-center shrink-0 mt-1">
                  <div className="w-2 h-2 rounded-full bg-teal-accent animate-pulse" />
                </div>
                <div className="bg-navy-800/40 border border-slate-700/50 p-4 rounded-2xl flex-1 hover:border-teal-accent/30 transition-colors">
                  <span className="text-[10px] font-mono text-teal-accent/60 mb-1 block">{item.time}</span>
                  <p className="text-sm text-slate-300">{item.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Empowerment & Autonomy Matrix */}
        <div className="glass p-8 rounded-3xl space-y-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-5 h-5 text-teal-accent" />
            <h3 className="text-lg font-bold">Team Empowerment Matrix</h3>
          </div>

          <div className="space-y-6">
            {teamGrowth.map((member, i) => (
              <div key={i} className="p-5 bg-navy-900/60 rounded-2xl border border-slate-700/50 hover:bg-navy-800/80 transition-all group cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-teal-accent transition-colors">
                      {member.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{member.role}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-teal-accent">{member.autonomyScore}</span>
                    <span className="text-[10px] block text-slate-500 uppercase tracking-widest mt-0.5">Autonomy</span>
                  </div>
                </div>

                <div className="relative h-1.5 bg-navy-800 rounded-full mb-4 overflow-hidden">
                  <motion.initial animate={{ width: `${member.autonomyScore}%` }} />
                  <div 
                    className="absolute top-0 left-0 h-full bg-teal-accent" 
                    style={{ width: `${member.autonomyScore}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/30 pt-3">
                  <span className="flex items-center gap-1.5">
                    <Target className="w-3 h-3 text-teal-accent" /> Focus: {member.nextMilestone}
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-teal-accent" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
