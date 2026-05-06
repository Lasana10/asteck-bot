"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Target, Star, Award, TrendingUp, CheckCircle, Lock, BookOpen } from 'lucide-react';

export default function InternEmpowerment() {
  const skills = [
    { name: 'Procedural Drafting', level: 'Intermediate', progress: 65 },
    { name: 'Client Interviewing', level: 'Novice', progress: 30 },
    { name: 'Evidence Indexing', level: 'Expert', progress: 95 },
    { name: 'Legal Research', level: 'Advanced', progress: 82 }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Intern Mastery & Performance</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Empowering the Next Generation of Counsel</p>
        </div>
        <div className="flex gap-4">
          <button className="btn-classic text-xs">Review Performance Report</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Profile / Status */}
        <div className="space-y-8">
          <div className="p-8 bg-heritage-green text-white rounded-[3rem] shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-6 opacity-20">
                <Award className="w-24 h-24" />
             </div>
             <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center text-emerald-400 mb-6">
                <Star className="w-10 h-10 fill-current" />
             </div>
             <h2 className="text-2xl heading-serif">Mastery Level: Silver</h2>
             <p className="text-xs opacity-70 mt-2">Associate Path: 75% Completed</p>
             <div className="w-full h-1.5 bg-white/20 rounded-full mt-4">
                <div className="w-3/4 h-full bg-emerald-400 rounded-full" />
             </div>
          </div>

          <div className="p-8 bg-white border border-slate-200 rounded-[3rem] space-y-6">
             <h3 className="text-sm font-black uppercase tracking-widest text-heritage-green flex items-center gap-2">
                <Target className="w-5 h-5" /> Active Learning Goals
             </h3>
             <ul className="space-y-4">
                <li className="flex items-center gap-3 p-3 bg-paper-white rounded-xl">
                   <CheckCircle className="w-4 h-4 text-emerald-500" />
                   <span className="text-xs font-bold text-slate-700">Draft 5 Assignations</span>
                </li>
                <li className="flex items-center gap-3 p-3 bg-paper-white rounded-xl">
                   <Clock className="w-4 h-4 text-orange-400" />
                   <span className="text-xs font-bold text-slate-700">Attend 2 Court Hearings</span>
                </li>
                <li className="flex items-center gap-3 p-3 bg-paper-white rounded-xl opacity-50">
                   <Lock className="w-4 h-4 text-slate-400" />
                   <span className="text-xs font-bold text-slate-700">Solo Matter Management</span>
                </li>
             </ul>
          </div>
        </div>

        {/* Skill Matrix */}
        <div className="md:col-span-2 space-y-8">
           <div className="card-heritage p-10 bg-white rounded-[3rem] border border-slate-200 shadow-xl space-y-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex justify-between items-center">
                 <span>Expertise Matrix</span>
                 <TrendingUp className="w-5 h-5 text-heritage-green" />
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 {skills.map((skill, i) => (
                    <div key={i} className="space-y-4">
                       <div className="flex justify-between items-end">
                          <div>
                             <h4 className="text-sm font-bold text-heritage-green">{skill.name}</h4>
                             <p className="text-[10px] text-slate-400 uppercase font-black">{skill.level}</p>
                          </div>
                          <span className="text-xs font-black text-heritage-green">{skill.progress}%</span>
                       </div>
                       <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${skill.progress}%` }}
                            transition={{ duration: 1.5, delay: i * 0.2 }}
                            className="h-full bg-heritage-green"
                          />
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="p-8 bg-slate-900 rounded-[3rem] text-white flex items-center gap-8 shadow-2xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-heritage-green/20 to-transparent pointer-events-none" />
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center shrink-0 border border-white/10">
                 <BookOpen className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                 <h4 className="text-lg font-bold heading-serif">TSIDEK Intelligence Training</h4>
                 <p className="text-xs opacity-60 leading-relaxed">
                    Personalized coaching active. The system is highlighting procedural errors in your drafts and suggesting OHADA compliance improvements in real-time.
                 </p>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}
