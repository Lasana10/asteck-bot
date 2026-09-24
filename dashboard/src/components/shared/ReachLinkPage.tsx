import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,Copy,MapPin,Navigation2,Route,ShieldCheck} from 'lucide-react';
import {Map as MapLibreMap,Marker,NavigationControl} from 'maplibre-gl';
import {resolveAfatReachLink} from '../../supabaseClient';
import {AFATLogo} from './AFATLogo';

export function ReachLinkPage({slug,token}:{slug:string;token:string}){
 const [data,setData]=useState<any>(null);
 const [error,setError]=useState('');
 const [copied,setCopied]=useState(false);
 const mapContainer=useRef<HTMLDivElement|null>(null);
 const mapRef=useRef<MapLibreMap|null>(null);

 useEffect(()=>{let active=true;resolveAfatReachLink(slug,token).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setData(data);});return()=>{active=false;};},[slug,token]);

 const target=data?.meeting_point||data?.access_point||data?.place;
 const handoffUrl=data?`/?destination=${encodeURIComponent(data.place?.canonical_name||'')}&place_ref=${encodeURIComponent(data.place?.place_ref||'')}&intent=${encodeURIComponent(data.intent_type||'go')}`:'/';
 const lat=Number(target?.latitude);
 const lon=Number(target?.longitude);

 useEffect(()=>{
  if(!mapContainer.current||!Number.isFinite(lat)||!Number.isFinite(lon))return;
  const map=new MapLibreMap({
   container:mapContainer.current,center:[lon,lat],zoom:16,
   style:{version:8,sources:{base:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors © CARTO'}},layers:[{id:'base',type:'raster',source:'base'}]},
  });
  map.addControl(new NavigationControl({showCompass:true}),'bottom-right');
  const el=document.createElement('div');el.style.width='24px';el.style.height='24px';el.style.borderRadius='999px';el.style.background='#06b6d4';el.style.border='4px solid white';el.style.boxShadow='0 8px 24px rgba(2,6,23,.35)';
  new Marker({element:el}).setLngLat([lon,lat]).addTo(map);
  mapRef.current=map;
  return()=>{map.remove();mapRef.current=null;};
 },[lat,lon]);

 const copy=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}catch{}};

 if(error)return <div className="flex min-h-screen items-center justify-center bg-[#050812] px-5 text-white"><div className="max-w-md rounded-[2rem] border border-rose-300/15 bg-slate-950/80 p-7 text-center"><AFATLogo className="mx-auto h-8 w-8 text-cyan-200"/><h1 className="mt-4 text-2xl font-black">This AFAT ReachLink is unavailable.</h1><p className="mt-2 text-sm text-white/45">{error}</p><a href="/" className="mt-5 inline-flex rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950">Open AFAT</a></div></div>;
 if(!data)return <div className="flex min-h-screen items-center justify-center bg-[#050812] text-white"><div className="text-center"><AFATLogo className="mx-auto h-8 w-8 animate-pulse text-cyan-200"/><p className="mt-4 text-sm text-white/50">Opening the reachable destination…</p></div></div>;

 return <div className="min-h-screen bg-[#050812] text-white">
  <header className="border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-5xl items-center justify-between"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-2"><AFATLogo className="h-5 w-5 text-cyan-100"/></div><div><p className="font-black">AFAT ReachLink</p><p className="text-[9px] uppercase tracking-[.18em] text-white/30">A pin is not enough</p></div></div><button onClick={copy} className="rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-white/60"><Copy className="mr-1.5 inline h-3.5 w-3.5"/>{copied?'Copied':'Copy'}</button></div></header>
  <main className="mx-auto max-w-5xl px-4 py-6">
   <section className="overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-950/80 shadow-2xl">
    <div className="p-5 sm:p-7">
     <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.17em] text-cyan-100">{String(data.intent_type||'reach').replace(/_/g,' ')}</span>{data.place?.place_ref&&<span className="text-[10px] font-bold text-white/35">{data.place.place_ref}</span>}</div>
     <h1 className="mt-4 text-3xl font-black sm:text-5xl">{data.place?.canonical_name||'AFAT destination'}</h1>
     <p className="mt-2 text-sm text-white/45">{[data.place?.zone_label,data.place?.city].filter(Boolean).join(' · ')}</p>
     {data.place?.local_directions&&<p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/65">{data.place.local_directions}</p>}
    </div>
    <div ref={mapContainer} className="h-[360px] w-full sm:h-[480px]"/>
   </section>

   <div className="mt-4 grid gap-4 md:grid-cols-2">
    {data.access_point&&<section className="rounded-[1.5rem] border border-violet-300/15 bg-violet-400/[0.05] p-5"><MapPin className="h-5 w-5 text-violet-200"/><p className="mt-3 text-[9px] font-black uppercase tracking-widest text-violet-200">Use this access</p><h2 className="mt-1 text-xl font-black">{data.access_point.name}</h2>{data.access_point.instructions&&<p className="mt-2 text-sm leading-6 text-white/50">{data.access_point.instructions}</p>}<p className="mt-3 text-[9px] uppercase text-white/30">{data.access_point.access_type} · {Math.round(Number(data.access_point.confidence||0))}% evidence</p></section>}
    {data.meeting_point&&<section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-400/[0.05] p-5"><Navigation2 className="h-5 w-5 text-amber-200"/><p className="mt-3 text-[9px] font-black uppercase tracking-widest text-amber-200">Meet here</p><h2 className="mt-1 text-xl font-black">{data.meeting_point.name}</h2>{data.meeting_point.instructions&&<p className="mt-2 text-sm leading-6 text-white/50">{data.meeting_point.instructions}</p>}<p className="mt-3 text-[9px] uppercase text-white/30">About {data.meeting_point.walk_minutes||0} min walk · {Math.round(Number(data.meeting_point.confidence||0))}% evidence</p></section>}
   </div>

   <section className="mt-4 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.05] p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-200"/><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Continue with AFAT</p></div><p className="mt-2 text-sm text-white/50">{data.booking_supported?'You can open AFAT to navigate this destination or book available transport.':'Open AFAT for navigation.'}</p></div><a href={handoffUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-xs font-black text-slate-950"><Route className="h-4 w-4"/>Navigate or book <ArrowRight className="h-4 w-4"/></a></div>
   </section>
  </main>
 </div>;
}
