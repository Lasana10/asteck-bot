"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Database, Gavel, Settings, User, ShieldCheck, Network, Folder } from 'lucide-react';
import PrecedentAnalyzer from './components/PrecedentAnalyzer';
import FirmDashboard from './components/FirmDashboard';
import ComplianceVault from './components/ComplianceVault';
import EmpowermentEngine from './components/EmpowermentEngine';
import DigitalFolder from './components/DigitalFolder';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'firm' | 'bull' | 'vault' | 'compliance' | 'empowerment' | 'folder'>('bull');

  const menuItems = [
    { id: 'bull', label: 'Analytics', icon: Gavel },
    { id: 'folder', label: 'Court Folders', icon: Folder },
    { id: 'firm', label: 'FirmOS Command', icon: LayoutDashboard },
    { id: 'vault', label: 'Knowledge Vault', icon: Database },
    { id: 'compliance', label: 'Compliance Guardian', icon: ShieldCheck },
    { id: 'empowerment', label: 'Growth Network', icon: Network },
  ];

  return (
    <div className="min-h-screen bg-paper-white text-slate-700">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 border-r border-slate-200 bg-white flex flex-col items-center py-8 gap-10 z-50 shadow-sm">
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
                  className="absolute left-0 top-1/4 w-1 h-1/2 bg-teal-accent rounded-r-full"
                />
              )}
              <span className="absolute left-24 px-3 py-1.5 bg-navy-800 text-teal-accent text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap uppercase tracking-widest border border-teal-accent/20">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-6">
          <button className="text-slate-500 hover:text-teal-accent transition-colors"><Settings className="w-6 h-6" /></button>
          <div className="w-10 h-10 rounded-full border border-teal-accent/20 p-1">
             <div className="w-full h-full rounded-full bg-navy-800 flex items-center justify-center text-[10px] font-bold text-teal-accent uppercase cursor-pointer hover:bg-teal-glow transition-all">
                JD
             </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="pl-32 pr-8 py-6 flex justify-between items-center bg-white/80 backdrop-blur-md fixed top-0 w-full z-40 border-b border-slate-200">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.4em]">
          CAMEROON • OHADA • CEMAC <span className="text-heritage-green ml-2 tracking-widest">TSIDKENU OPERATIONAL CORE</span>
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
            {activeTab === 'bull' && <PrecedentAnalyzer />}
            {activeTab === 'folder' && <DigitalFolder />}
            {activeTab === 'firm' && <FirmDashboard />}
            {activeTab === 'compliance' && <ComplianceVault />}
            {activeTab === 'empowerment' && <EmpowermentEngine />}
            {activeTab === 'vault' && (
              <div className="p-20 text-center space-y-4">
                <Database className="w-12 h-12 text-slate-700 mx-auto" />
                <h3 className="text-slate-500 font-bold uppercase tracking-widest text-sm">Knowledge Vault</h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">Access restricted. Encrypted local storage (OneDrive) syncing with firm context...</p>
              </div>
            )}
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
