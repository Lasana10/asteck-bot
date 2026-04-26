import React from 'react';
import {
  Home, Bell, User, Navigation2, QrCode,
  BarChart3, ShieldAlert, Ticket, Radio, Map
} from 'lucide-react';

interface Props {
  role: 'commuter' | 'operator' | 'admin' | 'planner';
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// ── Per-role tab definitions ────────────────────────────────────
const TAB_CONFIG: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
  commuter: [
    { id: 'home',          label: 'Accueil',     icon: Home },
    { id: 'bookings',      label: 'Voyages',     icon: Ticket },
    { id: 'notifications', label: 'Alertes',     icon: Bell },
    { id: 'profile',       label: 'Profil',      icon: User },
  ],
  operator: [
    { id: 'home',          label: 'Terminal',    icon: Radio },
    { id: 'bookings',      label: 'Demandes',    icon: QrCode },
    { id: 'notifications', label: 'Alertes',     icon: Bell },
    { id: 'profile',       label: 'Profil',      icon: User },
  ],
  planner: [
    { id: 'home',          label: 'Carte',       icon: Map },
    { id: 'bookings',      label: 'Rapports',    icon: BarChart3 },
    { id: 'notifications', label: 'Alertes',     icon: Bell },
    { id: 'profile',       label: 'Profil',      icon: User },
  ],
  admin: [
    { id: 'home',          label: 'Commande',    icon: ShieldAlert },
    { id: 'bookings',      label: 'Analytics',   icon: BarChart3 },
    { id: 'notifications', label: 'Alertes',     icon: Bell },
    { id: 'profile',       label: 'Profil',      icon: User },
  ],
};

// ── Per-role active-state accent color ─────────────────────────
const ROLE_ACCENT: Record<string, string> = {
  commuter: 'text-blue-400 bg-blue-400/10 shadow-[0_0_12px_rgba(96,165,250,0.3)]',
  operator: 'text-green-400 bg-green-400/10 shadow-[0_0_12px_rgba(74,222,128,0.3)]',
  planner:  'text-purple-400 bg-purple-400/10 shadow-[0_0_12px_rgba(192,132,252,0.3)]',
  admin:    'text-red-400 bg-red-400/10 shadow-[0_0_12px_rgba(248,113,113,0.3)]',
};

const ROLE_TEXT: Record<string, string> = {
  commuter: 'text-blue-400',
  operator: 'text-green-400',
  planner:  'text-purple-400',
  admin:    'text-red-400',
};

export function BottomNav({ role, activeTab, onTabChange }: Props) {
  const tabs = TAB_CONFIG[role] ?? TAB_CONFIG.commuter;
  const accentActive = ROLE_ACCENT[role] ?? ROLE_ACCENT.commuter;
  const accentText   = ROLE_TEXT[role] ?? ROLE_TEXT.commuter;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#080c14]/90 backdrop-blur-xl border-t border-white/6 px-2 pt-3 pb-5 flex items-center justify-around z-[1000] safe-area-inset-bottom">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 min-w-[56px] transition-all duration-200 active:scale-90 ${
              isActive ? accentText : 'text-white/30 hover:text-white/60'
            }`}
          >
            <div className={`p-2.5 rounded-2xl transition-all duration-200 ${isActive ? accentActive : ''}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest leading-none transition-all ${isActive ? 'opacity-100' : 'opacity-0'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
