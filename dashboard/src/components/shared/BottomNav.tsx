import React from 'react';
import {
  Home, Bell, User, Navigation2, QrCode,
  BarChart3, ShieldAlert, Ticket, Radio, Map
} from 'lucide-react';

interface Props {
  role: 'commuter' | 'operator' | 'admin' | 'planner' | 'organization' | 'government';
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// ── Per-role tab definitions ────────────────────────────────────
const TAB_CONFIG: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
  commuter: [
    { id: 'home',          label: 'Home',        icon: Home },
    { id: 'bookings',      label: 'Book',        icon: Ticket },
    { id: 'notifications', label: 'Intel',       icon: Radio },
    { id: 'profile',       label: 'Profile',     icon: User },
  ],
  operator: [
    { id: 'home',          label: 'Terminal',    icon: Home },
    { id: 'bookings',      label: 'Requests',    icon: QrCode },
    { id: 'notifications', label: 'Intel',       icon: Radio },
    { id: 'profile',       label: 'Profile',     icon: User },
  ],
  planner: [
    { id: 'home',          label: 'Map',         icon: Map },
    { id: 'bookings',      label: 'Reports',     icon: BarChart3 },
    { id: 'notifications', label: 'Alerts',      icon: Bell },
    { id: 'profile',       label: 'Profile',     icon: User },
  ],
  organization: [
    { id: 'home',          label: 'Overview',    icon: Home },
    { id: 'bookings',      label: 'Fleet',       icon: Navigation2 },
    { id: 'notifications', label: 'Compliance',  icon: ShieldAlert },
    { id: 'profile',       label: 'Organisation', icon: User },
  ],
  government: [
    { id: 'home',          label: 'Conditions', icon: Map },
    { id: 'bookings',      label: 'Evidence',   icon: BarChart3 },
    { id: 'notifications', label: 'Response',   icon: Radio },
    { id: 'profile',       label: 'Mandate',    icon: ShieldAlert },
  ],
  admin: [
    { id: 'home',          label: 'Command',     icon: ShieldAlert },
    { id: 'bookings',      label: 'Analytics',   icon: BarChart3 },
    { id: 'notifications', label: 'Alerts',      icon: Bell },
    { id: 'profile',       label: 'Profile',     icon: User },
  ],
};

// ── Per-role active-state accent color ─────────────────────────
const ROLE_ACCENT: Record<string, string> = {
  commuter: 'text-blue-400 bg-blue-400/10 shadow-[0_0_12px_rgba(96,165,250,0.3)]',
  operator: 'text-green-400 bg-green-400/10 shadow-[0_0_12px_rgba(74,222,128,0.3)]',
  planner:  'text-purple-400 bg-purple-400/10 shadow-[0_0_12px_rgba(192,132,252,0.3)]',
  organization: 'text-cyan-300 bg-cyan-300/10 shadow-[0_0_12px_rgba(103,232,249,0.3)]',
  government: 'text-teal-300 bg-teal-300/10 shadow-[0_0_12px_rgba(94,234,212,0.3)]',
  admin:    'text-red-400 bg-red-400/10 shadow-[0_0_12px_rgba(248,113,113,0.3)]',
};

const ROLE_TEXT: Record<string, string> = {
  commuter: 'text-blue-400',
  operator: 'text-green-400',
  planner:  'text-purple-400',
  organization: 'text-cyan-300',
  government: 'text-teal-300',
  admin:    'text-red-400',
};

const ROLE_DOT: Record<string, string> = {
  commuter: 'bg-blue-400',
  operator: 'bg-green-400',
  planner:  'bg-purple-400',
  organization: 'bg-cyan-300',
  government: 'bg-teal-300',
  admin:    'bg-red-400',
};

export function BottomNav({ role, activeTab, onTabChange }: Props) {
  const tabs = TAB_CONFIG[role] ?? TAB_CONFIG.commuter;
  const accentActive = ROLE_ACCENT[role] ?? ROLE_ACCENT.commuter;
  const accentText   = ROLE_TEXT[role] ?? ROLE_TEXT.commuter;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[5000] w-[calc(100%-48px)] max-w-lg">
      <nav className="bg-slate-950/80 backdrop-blur-2xl border border-cyan-400/10 p-2.5 rounded-[2rem] flex items-center justify-around shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_28px_rgba(59,130,246,0.08)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-300 relative group py-2 rounded-2xl ${
                isActive ? accentText : 'text-slate-500 hover:text-cyan-200'
              }`}
            >
              <div className={`p-2 rounded-xl transition-all duration-300 ${isActive ? accentActive : 'group-hover:bg-cyan-400/10'}`}>
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
              </div>
              
              {isActive && (
                <div className={`absolute -bottom-1 w-1 h-1 rounded-full ${ROLE_DOT[role] || 'bg-blue-400'} shadow-[0_0_10px_currentColor] animate-pulse`} />
              )}
              
              <span className={`text-[8px] font-black uppercase tracking-[0.16em] leading-none transition-all duration-300 ${isActive ? 'opacity-100 scale-100' : 'opacity-60 scale-100'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
