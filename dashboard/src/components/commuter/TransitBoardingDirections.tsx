import React, { useEffect, useRef, useState } from 'react';
import { Footprints, LocateFixed, RefreshCw, Navigation2, StopCircle } from 'lucide-react';
import { fetchCanonicalAfatRoute, isUsableCanonicalRoute, type AfatCanonicalRoute } from '../../services/canonicalRouteClient';
import { calculateRouteProgress, nextRoadManeuver, type AfatRouteProgress } from '../../services/routeGuidance';
import { evaluateSpatialFix } from '../../services/spatialPositioning';

export function TransitBoardingDirections({latitude,longitude,stopName}: {
  latitude:number; longitude:number; stopName?:string;
}) {
  const requestId=useRef(0);
  const watchId=useRef<number|null>(null);
  const [loading,setLoading]=useState(false);
  const [route,setRoute]=useState<AfatCanonicalRoute|null>(null);
  const [progress,setProgress]=useState<AfatRouteProgress|null>(null);
  const [nextTurn,setNextTurn]=useState<string|null>(null);
  const [tracking,setTracking]=useState(false);
  const [notice,setNotice]=useState('');

  const stopTracking=()=>{
    if(watchId.current!==null && typeof navigator!=='undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current=null;
    }
    setTracking(false);
  };

  useEffect(()=>{
    requestId.current++;
    setRoute(null);setProgress(null);setNextTurn(null);setNotice('');setLoading(false);
    return ()=>{
      requestId.current++;
      if(watchId.current!==null && navigator.geolocation){
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current=null;
      }
    };
  },[latitude,longitude]);

  const findFootRoute=()=>{
    if(!navigator.geolocation){
      setNotice('This device cannot provide its current position. No walking route was assumed.');
      return;
    }
    stopTracking();
    const id=++requestId.current;
    setLoading(true);setNotice('');setRoute(null);setProgress(null);setNextTurn(null);
    navigator.geolocation.getCurrentPosition(async position=>{
      if(id!==requestId.current)return;
      const fix=evaluateSpatialFix({
        latitude:position.coords.latitude,longitude:position.coords.longitude,
        accuracyM:position.coords.accuracy,timestampMs:position.timestamp,source:'device_gnss',
      });
      if(!fix.accepted||!fix.fix||Date.now()-position.timestamp>30000){
        setNotice('A fresh and reasonably precise location is needed for a walking route.');
        setLoading(false);return;
      }
      try{
        // Reuse AFAT's canonical Atlas / private foot-OSRM routing, validation,
        // cache, and fallback rules. Never substitute a driving route.
        const result=await fetchCanonicalAfatRoute({
          originLatitude:fix.fix.latitude,originLongitude:fix.fix.longitude,
          destinationLatitude:latitude,destinationLongitude:longitude,mode:'walk',
        });
        if(id!==requestId.current)return;
        if(!isUsableCanonicalRoute(result,'walk') ||
          !['afat_atlas','osrm'].includes(String(result.route_source))){
          throw new Error('AFAT could not confirm a connected pedestrian path.');
        }
        setRoute(result);
      }catch(error:any){
        if(id===requestId.current)setNotice(error?.message||'Walking directions unavailable. No straight-line path was invented.');
      }finally{
        if(id===requestId.current)setLoading(false);
      }
    },error=>{
      if(id!==requestId.current)return;
      setLoading(false);
      setNotice(error.code===1?'Allow location access to request a real walking route.':
        'AFAT could not obtain a current reliable position. No walking path was invented.');
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  };

  const beginTracking=()=>{
    if(!route || !navigator.geolocation || watchId.current!==null)return;
    const selected=route;
    setNotice('Walking guidance uses GPS only on this device; it does not report your movement as verified transit evidence.');
    setTracking(true);
    watchId.current=navigator.geolocation.watchPosition(position=>{
      const decision=evaluateSpatialFix({
        latitude:position.coords.latitude,longitude:position.coords.longitude,
        accuracyM:position.coords.accuracy,timestampMs:position.timestamp,source:'device_gnss',
      });
      if(!decision.accepted||!decision.fix||Date.now()-position.timestamp>30000){
        setProgress(null);setNextTurn(null);
        setNotice('GPS uncertainty: walking position and turn guidance are temporarily withheld.');
        return;
      }
      const p=calculateRouteProgress(selected,{
        latitude:decision.fix.latitude,longitude:decision.fix.longitude,
        accuracy:decision.fix.accuracyM,recordedAt:new Date(decision.fix.timestampMs).toISOString(),
      });
      setProgress(p);
      const maneuver=nextRoadManeuver(selected,{
        latitude:decision.fix.latitude,longitude:decision.fix.longitude,
        accuracy:decision.fix.accuracyM,recordedAt:new Date(decision.fix.timestampMs).toISOString(),
      });
      setNextTurn(maneuver?.instruction||null);
      if(p?.offRoute)setNotice('You may be off the reviewed walking path. Recheck your location and refresh the route.');
      else setNotice('');
    },error=>{
      setProgress(null);setNextTurn(null);
      setNotice(error.code===1?'GPS permission withdrawn. Stop guidance or allow location again.':'Walking GPS temporarily unavailable.');
    },{enableHighAccuracy:true,maximumAge:0,timeout:10000});
  };

  const meters=route?.distance_m;
  return <section className="mt-3 rounded-xl border border-violet-300/20 bg-black/20 p-3" aria-label="Walking directions to reviewed transit stop">
    <p className="text-[10px] font-bold text-white">Pedestrian directions to {stopName||'this reviewed boarding stop'}</p>
    <p className="mt-1 text-[10px] leading-4 text-white/55">
      Route calculation uses your location on request. Live walking progress is optional;
      no route proves a safe crossing, verified boarding or live vehicle.
    </p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={findFootRoute} disabled={loading}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 text-[10px] font-black text-violet-100 disabled:opacity-40">
        {loading?<RefreshCw className="h-4 w-4 animate-spin"/>:<LocateFixed className="h-4 w-4"/>}
        {loading?'Checking pedestrian network…':route?'Refresh pedestrian route':'Find walking route to boarding'}
      </button>
      {route&&<button type="button" onClick={tracking?stopTracking:beginTracking}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-[10px] font-bold text-white">
        {tracking?<StopCircle className="h-4 w-4"/>:<Navigation2 className="h-4 w-4"/>}
        {tracking?'Stop GPS guidance':'Follow walking route'}
      </button>}
    </div>
    {notice&&<p role="status" className="mt-2 text-[10px] text-amber-100">{notice}</p>}
    {route&&<div className="mt-3">
      <p className="flex items-center gap-2 text-xs font-bold text-violet-100">
        <Footprints className="h-4 w-4"/>Pedestrian path: {((meters||0)/1000).toFixed(2)} km
        {route.eta_seconds!=null&&` · ${Math.ceil(route.eta_seconds/60)} min estimated`}
      </p>
      <p className="mt-1 text-[10px] text-white/55">Provider: {route.route_source==='afat_atlas'?'AFAT Atlas':'Foot OSRM'}. Path geometry is real mapped evidence, not straight-line distance. Check local crossings and access.</p>
      {tracking&&progress&&<p className="mt-2 text-xs text-white">
        {Math.max(0,Math.round(progress.remainingDistanceM))} m remaining on mapped path
        {progress.offRoute?' · possible off-route':' · on route estimate'}
      </p>}
      {tracking&&nextTurn&&<p className="mt-1 text-[10px] font-bold text-cyan-100">Next mapped instruction: {nextTurn}</p>}
    </div>}
  </section>;
}
