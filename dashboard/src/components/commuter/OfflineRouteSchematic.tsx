import React,{useMemo} from 'react';
import type {AfatCanonicalRoute} from '../../services/canonicalRouteClient';
import {offlineRouteSchematic,schematicProgressPoint} from '../../services/offlineRouteSchematic';
type Props={route:AfatCanonicalRoute|null|undefined;progress:number;label?:string|null};
export function OfflineRouteSchematic({route,progress,label}:Props){
 const schematic=useMemo(()=>offlineRouteSchematic(route),[route]);
 if(!schematic)return null;
 const position=schematicProgressPoint(schematic,progress);
 return <div className="absolute inset-0 z-[5] flex items-center justify-center bg-[#07121d]" role="img"
   aria-label="Offline schematic of your saved route, without live map tiles or verified road conditions">
   <div className="absolute left-4 right-4 top-28 rounded-xl bg-slate-950/70 px-4 py-2 text-[10px] leading-5 text-amber-100">
     Offline route geometry · schematic only, not a street map. Live closures, entrance conditions and traffic are unavailable.
   </div>
   <svg viewBox="0 0 320 210" className="h-[60%] w-[95%] max-w-[620px]" aria-hidden="true">
     <path d={schematic.path} fill="none" stroke="rgba(56,189,248,.16)" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round"/>
     <path d={schematic.path} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
     <circle cx={schematic.start.x} cy={schematic.start.y} r="5.5" fill="#10b981" stroke="#07121d" strokeWidth="2"/>
     <circle cx={schematic.end.x} cy={schematic.end.y} r="6" fill="#fbbf24" stroke="#07121d" strokeWidth="2"/>
     {progress>0&&<circle cx={position.x} cy={position.y} r="5" fill="#fff" stroke="#0284c7" strokeWidth="2"/>}
   </svg>
   <p className="absolute bottom-32 left-4 right-4 text-center text-[10px] text-slate-300">
     {label||'Saved destination'} · {route?.route_source==='afat_atlas'?'AFAT graph, review varies':'External road-network estimate'} · No live traffic
   </p>
 </div>;
}
