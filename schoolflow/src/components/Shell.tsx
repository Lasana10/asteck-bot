import { BarChart3, BookOpenCheck, Building2, CircleUserRound, ClipboardCheck, GraduationCap, MessageSquareMore, ReceiptText, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { SchoolBrand } from "../domain/types";

export type ViewKey = "command" | "operations" | "learners" | "teachers" | "finance" | "signals" | "studio";
const nav = [
  {id:"command" as const,label:"Command centre",icon:BarChart3},
  {id:"operations" as const,label:"Daily operations",icon:ClipboardCheck},
  {id:"learners" as const,label:"Learner OneFiles",icon:GraduationCap},
  {id:"teachers" as const,label:"Teacher studio",icon:BookOpenCheck},
  {id:"finance" as const,label:"TrustLedger",icon:ReceiptText},
  {id:"signals" as const,label:"Voice & signals",icon:MessageSquareMore},
  {id:"studio" as const,label:"School studio",icon:Settings2},
];

export default function Shell({ brand, view, onView, signalCount, onFeedback, children }:{brand:SchoolBrand;view:ViewKey;onView:(view:ViewKey)=>void;signalCount:number;onFeedback:()=>void;children:ReactNode}) {
  return <main className="shell" style={{"--brand":brand.primaryColor,"--accent":brand.accentColor} as React.CSSProperties}>
    <aside className="sidebar">
      <div className="brand"><span>D</span><div><strong>DREEM</strong><small>Proof to Progress</small></div></div>
      <div className="school"><span>{brand.logoUrl?<img src={brand.logoUrl} alt=""/>:brand.shortName}</span><div><strong>{brand.name}</strong><small><Building2 size={11}/>{brand.city} · {brand.subsystem}</small></div></div>
      <nav><small>OPERATIONS</small>{nav.map(item=><button key={item.id} className={view===item.id?"active":""} onClick={()=>onView(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id==="signals"&&signalCount>0?<b>{signalCount}</b>:null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure"><ShieldCheck size={17}/><span><strong>Protected workspace</strong><small>Audit trail active</small></span></div><button className="account"><CircleUserRound/><span><strong>Principal Abah</strong><small>Principal · Founder oversight</small></span></button></div>
    </aside>
    <section className="workspace"><header><div><span>DREEM SCHOOL OPERATING SYSTEM</span><h1>{nav.find(item=>item.id===view)?.label}</h1></div><div><button className="language">EN / FR</button><button className="feedback" onClick={onFeedback}><MessageSquareMore size={15}/>Give feedback</button></div></header>{children}</section>
    <nav className="mobile-nav">{nav.slice(0,5).map(item=><button key={item.id} className={view===item.id?"active":""} onClick={()=>onView(item.id)}><item.icon size={19}/><span>{item.label.split(" ")[0]}</span></button>)}</nav>
  </main>;
}

export function EmptyState({ title, body }:{title:string;body:string}) { return <div className="empty"><UsersRound/><strong>{title}</strong><p>{body}</p></div>; }
