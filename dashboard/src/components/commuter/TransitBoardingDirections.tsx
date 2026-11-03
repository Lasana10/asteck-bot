import React, { useEffect, useRef, useState } from 'react';
import { Footprints, LocateFixed, RefreshCw } from 'lucide-react';
import { getApiBaseUrl } from '../../supabaseClient';

type FootRoute = {
  distanceMeters: number;
  durationSeconds: number;
  steps: string[];
  warnings: string[];
};

export function TransitBoardingDirections({latitude,longitude,stopName}: {
  latitude:number; longitude:number; stopName?:string;
}) {
  const requestId=useRef(0);
  const [loading,setLoading]=useState(false);
  const [route,setRoute]=useState<FootRoute|null>(null);
  const [notice,setNotice]=useState('');

  // Never carry walking directions across two different reviewed boarding stops.
  useEffect(()=>{
    requestId.current++;
    setRoute(null);setNotice('');setLoading(false);
    return ()=>{requestId.current++;};
  },[latitude,longitude]);

  const findFootRoute=()=>{
    if(!navigator.geolocation){
      setNotice('This device cannot provide its current position. No walking route was assumed.');
      return;
    }
    const id=++requestId.current;
    setLoading(true);setNotice('');setRoute(null);
    navigator.geolocation.getCurrentPosition(async position=>{
      if(id!==requestId.current)return;
      const {latitude:originLat,longitude:originLon,accuracy}=position.coords;
      if(!Number.isFinite(originLat)||!Number.isFinite(originLon)||accuracy>120||
          Math.abs(originLat)>90||Math.abs(originLon)>180||
          !Number.isFinite(position.timestamp)||Date.now()-position.timestamp>30000){
        setNotice('A fresh and reasonably precise location is needed for a walking route.');
        setLoading(false);return;
      }
      const params=new URLSearchParams({
        origin_lat:String(originLat),origin_lon:String(originLon),
        destination_lat:String(latitude),destination_lon:String(longitude),
        mode:'foot',
      });
      try{
        const res=await fetch(`${getApiBaseUrl()}/api/navigation/route?${params.toString()}`,
          {headers:{Accept:'application/json'}});
        const result=await res.json();
        if(id!==requestId.current)return;
        if(!res.ok)throw new Error(result?.error||'Walking router unavailable.');
        const primary=result?.primary;
        if(result?.travel_mode!=='foot'||result?.source!=='osrm'||
           !primary||!Number.isFinite(primary.distanceMeters)||primary.distanceMeters<0||
           !Number.isFinite(primary.durationValue)||primary.durationValue<0){
          throw new Error('AFAT did not receive a confirmed pedestrian route.');
        }
        setRoute({
          distanceMeters:primary.distanceMeters,
          durationSeconds:primary.durationValue,
          steps:Array.isArray(primary.steps)?primary.steps.filter((v:unknown)=>typeof v==='string').slice(0,16):[],
          warnings:Array.isArray(primary.warnings)?primary.warnings.filter((v:unknown)=>typeof v==='string').slice(0,5):[],
        });
      }catch(error:any){
        if(id===requestId.current)setNotice(error?.message||'Walking directions are unavailable. Never assume a straight-line path is walkable.');
      }finally{
        if(id===requestId.current)setLoading(false);
      }
    },error=>{
      if(id!==requestId.current)return;
      setLoading(false);
      setNotice(error.code===1?'Allow location access to request a real walking route.':
        'AFAT could not obtain an accurate current location. No walking path was invented.');
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  };

  return <section className="mt-3 rounded-xl border border-violet-300/20 bg-black/20 p-3" aria-label="Walking directions to reviewed transit stop">
    <p className="text-[10px] font-bold text-white">Get a pedestrian route to {stopName||'this reviewed boarding stop'}</p>
    <p className="mt-1 text-[10px] leading-4 text-white/55">
      Uses your current device location only when requested. The foot-routing engine must confirm a connected path;
      transport availability and crossing safety remain unverified.
    </p>
    <button type="button" onClick={findFootRoute} disabled={loading}
      className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 text-[10px] font-black text-violet-100 disabled:opacity-40">
      {loading?<RefreshCw className="h-4 w-4 animate-spin"/>:<LocateFixed className="h-4 w-4"/>}
      {loading?'Checking pedestrian network…':route?'Refresh walking route':'Find walking route to boarding'}
    </button>
    {notice&&<p role="status" className="mt-2 text-[10px] text-amber-100">{notice}</p>}
    {route&&<div className="mt-3">
      <p className="flex items-center gap-2 text-xs font-bold text-violet-100">
        <Footprints className="h-4 w-4"/>Pedestrian route: {(route.distanceMeters/1000).toFixed(2)} km · {Math.ceil(route.durationSeconds/60)} min estimated
      </p>
      <p className="mt-1 text-[10px] leading-4 text-white/55">Based on the foot network, not straight-line distance. Check local crossings and entrances.</p>
      {route.warnings.map((warning,i)=><p key={i} className="mt-1 text-[10px] text-amber-100">{warning}</p>)}
      {route.steps.length>0&&<ol className="mt-2 list-inside list-decimal space-y-1 text-[10px] text-white/70">
        {route.steps.map((step,i)=><li key={i}>{step}</li>)}
      </ol>}
    </div>}
  </section>;
}
