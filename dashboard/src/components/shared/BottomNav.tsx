import React from 'react';
import {
  Home, Bell, User, Navigation2, QrCode, BarChart3,
  ShieldAlert, Ticket, Radio, Map, MapPinned
} from 'lucide-react';
import { useAfatLocale } from '../../localization';

interface Props {
  role: 'commuter' | 'operator' | 'admin' | 'planner' | 'organization' | 'government';
  activeTab: string;
  onTabChange: (tab: string) => void;
}

type TabDef={ id:string; label:string; labelKey?:string; icon:React.ElementType };

const TAB_CONFIG: Record<string, TabDef[]> = {
  commuter: [
    { id:'home',label:'Explore',labelKey:'nav.home',icon:Map },
    { id:'bookings',label:'Trips',labelKey:'nav.trips',icon:Ticket },
    { id:'atlas',label:'Atlas',labelKey:'nav.atlas',icon:MapPinned },
    { id:'notifications',label:'Safety',labelKey:'nav.safety',icon:Radio },
    { id:'profile',label:'Me',labelKey:'nav.account',icon:User },
  ],
  operator: [
    { id:'home',label:'Terminal',labelKey:'nav.home',icon:Home },
    { id:'bookings',label:'Missions',labelKey:'nav.trips',icon:QrCode },
    { id:'atlas',label:'Atlas',labelKey:'nav.atlas',icon:MapPinned },
    { id:'notifications',label:'Alerts',labelKey:'nav.safety',icon:Radio },
    { id:'profile',label:'Account',labelKey:'nav.account',icon:User },
  ],
  planner: [
    { id:'home',label:'Situation',labelKey:'nav.home',icon:Map },
    { id:'bookings',label:'Dispatch',labelKey:'nav.trips',icon:BarChart3 },
    { id:'atlas',label:'Atlas',labelKey:'nav.atlas',icon:MapPinned },
    { id:'notifications',label:'Disruptions',labelKey:'nav.safety',icon:Bell },
    { id:'profile',label:'Authority',labelKey:'nav.account',icon:User },
  ],
  organization: [
    { id:'home',label:'Overview',labelKey:'nav.home',icon:Home },
    { id:'bookings',label:'Assign',labelKey:'nav.trips',icon:Navigation2 },
    { id:'notifications',label:'Compliance',labelKey:'nav.safety',icon:ShieldAlert },
    { id:'profile',label:'Organisation',labelKey:'nav.account',icon:User },
  ],
  government: [
    { id:'home',label:'Conditions',labelKey:'nav.home',icon:Map },
    { id:'bookings',label:'Mandate',labelKey:'nav.trips',icon:BarChart3 },
    { id:'atlas',label:'Atlas',labelKey:'nav.atlas',icon:MapPinned },
    { id:'notifications',label:'Response',labelKey:'nav.safety',icon:Radio },
    { id:'profile',label:'Institution',labelKey:'nav.account',icon:ShieldAlert },
  ],
  admin: [
    { id:'home',label:'Command',labelKey:'nav.home',icon:ShieldAlert },
    { id:'bookings',label:'Authority',labelKey:'nav.trips',icon:BarChart3 },
    { id:'atlas',label:'Atlas',labelKey:'nav.atlas',icon:MapPinned },
    { id:'notifications',label:'Integrity',labelKey:'nav.safety',icon:Bell },
    { id:'profile',label:'Audit',labelKey:'nav.account',icon:User },
  ],
};

const ROLE_ACCENT:Record<string,string>={
  commuter:'text-blue-400 bg-blue-400/10 shadow-[0_0_12px_rgba(96,165,250,0.3)]',
  operator:'text-green-400 bg-green-400/10 shadow-[0_0_12px_rgba(74,222,128,0.3)]',
  planner:'text-purple-400 bg-purple-400/10 shadow-[0_0_12px_rgba(192,132,252,0.3)]',
  organization:'text-cyan-300 bg-cyan-300/10 shadow-[0_0_12px_rgba(103,232,249,0.3)]',
  government:'text-teal-300 bg-teal-300/10 shadow-[0_0_12px_rgba(94,234,212,0.3)]',
  admin:'text-red-400 bg-red-400/10 shadow-[0_0_12px_rgba(248,113,113,0.3)]',
};
const ROLE_TEXT:Record<string,string>={commuter:'text-blue-400',operator:'text-green-400',planner:'text-purple-400',organization:'text-cyan-300',government:'text-teal-300',admin:'text-red-400'};
const ROLE_DOT:Record<string,string>={commuter:'bg-blue-400',operator:'bg-green-400',planner:'bg-purple-400',organization:'bg-cyan-300',government:'bg-teal-300',admin:'bg-red-400'};

export function BottomNav({role,activeTab,onTabChange}:Props){
  const {t}=useAfatLocale();
  const tabs=TAB_CONFIG[role]??TAB_CONFIG.commuter;
  const accentActive=ROLE_ACCENT[role]??ROLE_ACCENT.commuter;
  const accentText=ROLE_TEXT[role]??ROLE_TEXT.commuter;
  return <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[5000] w-[calc(100%-24px)] max-w-2xl -translate-x-1/2">
    <nav className="flex items-center justify-around rounded-[1.75rem] border border-cyan-400/10 bg-slate-950/90 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_28px_rgba(59,130,246,0.08)] backdrop-blur-2xl sm:p-2.5">
      {tabs.map(tab=>{
        const Icon=tab.icon; const active=activeTab===tab.id; const label=tab.labelKey?t(tab.labelKey,tab.label):tab.label;
        return <button key={tab.id} type="button" aria-label={label} aria-current={active?'page':undefined} onClick={()=>onTabChange(tab.id)}
          className={`group relative flex min-h-16 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 transition-all duration-300 ${active?accentText:'text-slate-500 hover:text-cyan-200'}`}>
          <div className={`rounded-xl p-1.5 transition-all duration-300 ${active?accentActive:'group-hover:bg-cyan-400/10'}`}><Icon className={`h-5 w-5 ${active?'scale-110':''}`}/></div>
          {active&&<div className={`absolute -bottom-1 h-1 w-1 rounded-full ${ROLE_DOT[role]||'bg-blue-400'} animate-pulse`}/>}
          <span className={`text-[7px] font-black uppercase tracking-[0.13em] leading-none ${active?'opacity-100':'opacity-60'}`}>{label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
