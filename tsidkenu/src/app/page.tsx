"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Database, Gavel, Settings, User, ShieldCheck, Network, Folder, Bell, Cpu, BookOpen, Clock, Milestone, FileStack, Server, Target, UserPlus, Globe, Award } from 'lucide-react';
import PrecedentAnalyzer from '@/components/PrecedentAnalyzer';
import FirmDashboard from '@/components/FirmDashboard';
import ComplianceVault from '@/components/ComplianceVault';
import GrowthNetwork from '@/components/GrowthNetwork';
import DigitalFolder from '@/components/DigitalFolder';
import CaseLedger from '@/components/CaseLedger';
import BillingPayments from '@/components/BillingPayments';
import NotificationCenter from '@/components/NotificationCenter';
import LoopholeDetector from '@/components/LoopholeDetector';
import LexCore from '@/components/LexCore';
import PanAfricanLaw from '@/components/PanAfricanLaw';
import ConflictShield from '@/components/ConflictShield';
import BillableTimer from '@/components/BillableTimer';
import MatterPipeline from '@/components/MatterPipeline';
import EvidenceMaster from '@/components/EvidenceMaster';
import SovereignNode from '@/components/SovereignNode';
import InternEmpowerment from '@/components/InternEmpowerment';
import FileVault from '@/components/FileVault';
import LitigationOutcome from '@/components/LitigationOutcome';
import ClientIntake from '@/components/ClientIntake';
import LegalFirstAid from '@/components/LegalFirstAid';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'bull' | 'compliance' | 'empowerment' | 'folder' | 'ledger' | 'billing' | 'alerts' | 'loophole' | 'lex' | 'bible' | 'conflict' | 'timer' | 'pipeline' | 'evidence' | 'sovereign' | 'vault' | 'outcome' | 'intake' | 'public'>('lex');

  const menuItems = [
    { id: 'lex', label: 'TSIDEK Command', icon: Cpu },
    { id: 'outcome', label: 'Litigation Strategy', icon: Target },
    { id: 'intake', label: 'Client Intake', icon: UserPlus },
    { id: 'public', label: 'Justice Guide', icon: Globe },
    { id: 'bible', label: 'Pan-African Bible', icon: BookOpen },
    { id: 'pipeline', label: 'Matter Pipeline', icon: Milestone },
    { id: 'ledger', label: 'Case Ledger', icon: LayoutDashboard },
    { id: 'billing', label: 'Billing & Payments', icon: Database },
    { id: 'alerts', label: 'Sentinel Alerts', icon: Bell },
    { id: 'empowerment', label: 'Intern Mastery', icon: Award },
    { id: 'vault', label: 'Sovereign Vault', icon: FileStack },
  ];

  return (
    <div className="min-h-screen bg-paper-white text-slate-700">
      {/* Sidebar Navigation (Desktop) */}
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-20 border-r border-slate-200 bg-white flex-col items-center py-8 gap-10 z-50 shadow-sm">
        <div className="w-10 h-10 bg-heritage-green rounded flex items-center justify-center shadow-lg">
          <span className="text-white font-black text-xl heading-serif">T</span>
        </div>
        
        <div className="flex flex-col gap-6">
          {menuItems.map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`p-3 rounded-lg transition-all duration-300 relative group
                ${activeTab === item.id ? 'bg-heritage-green text-white shadow-md' : 'text-slate-400 hover:text-heritage-green'}`}
            >
              <item.icon className="w-6 h-6" />
              {activeTab === item.id && (
                <motion.div 
                  layoutId="active-nav"
                  className="absolute left-0 top-1/4 w-1 h-1/2 bg-heritage-green rounded-r-full"
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around py-4 z-50 shadow-2xl">
        {menuItems.slice(0, 4).map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`p-2 rounded-lg transition-all ${activeTab === item.id ? 'text-heritage-green' : 'text-slate-400'}`}
          >
            <item.icon className="w-6 h-6" />
          </button>
        ))}
      </nav>

      {/* Header */}
      <header className="pl-32 pr-8 py-6 flex justify-between items-center bg-white/80 backdrop-blur-md fixed top-0 w-full z-40 border-b border-slate-200">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.4em]">
          PAN-AFRICAN LEGAL OPERATIONS <span className="text-heritage-green ml-2 tracking-widest">TSIDEK SOFTWARE</span>
        </h2>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full glass border-none">
            <div className="w-2 h-2 rounded-full bg-teal-accent shadow-[0_0_8px_#64FFDA]" />
            <span className="text-[10px] font-bold tracking-widest uppercase">Encryption Status: Elite</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="pl-20 pt-24 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'lex' && <LexCore />}
            {activeTab === 'outcome' && <LitigationOutcome />}
            {activeTab === 'intake' && <ClientIntake />}
            {activeTab === 'public' && <LegalFirstAid />}
            {activeTab === 'bible' && <PanAfricanLaw />}
            {activeTab === 'pipeline' && <MatterPipeline />}
            {activeTab === 'ledger' && <CaseLedger />}
            {activeTab === 'billing' && <BillingPayments />}
            {activeTab === 'alerts' && <NotificationCenter />}
            {activeTab === 'empowerment' && <InternEmpowerment />}
            {activeTab === 'vault' && <FileVault />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* AI Assistant Floating Widget */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-8 right-8 w-14 h-14 bg-teal-accent text-navy-900 rounded-2xl shadow-2xl shadow-teal-accent/30 flex items-center justify-center z-50 group overflow-hidden"
      >
        <div className="absolute inset-0 bg-white/20 scale-0 group-hover:scale-100 transition-transform duration-500 rounded-full" />
        <User className="w-6 h-6 relative z-10" />
      </motion.button>
    </div>
  );
}
