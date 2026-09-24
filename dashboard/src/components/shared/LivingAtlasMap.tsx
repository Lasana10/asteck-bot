import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, MapPinned, RefreshCw } from 'lucide-react';
import { Map as MapLibreMap, NavigationControl, Popup } from 'maplibre-gl';
import { supabase } from '../../supabaseClient';

type AtlasPayload={
  city?:{city_name?:string;learning_stage?:string;operational_confidence?:number};
  edges?:any[]; candidates?:any[]; mapping_observations?:any[]; missions?:any[]; predictions?:any[];
};
type ReachabilityPayload={destinations?:any[];access_points?:any[];meeting_points?:any[]};

function edgeColor(status:string){
  if(status==='verified') return '#22c55e';
  if(status==='corroborated') return '#38bdf8';
  if(status==='disputed') return '#ef4444';
  return '#64748b';
}
function candidateColor(status:string){
  if(status==='trusted') return '#a78bfa';
  if(status==='corroborated') return '#f59e0b';
  return '#f97316';
}
function pointColor(type:string){
  if(type==='informal_stop'||type==='pickup_point') return '#06b6d4';
  if(type==='entrance') return '#22c55e';
  if(type==='landmark') return '#eab308';
  if(type==='missing_road'||type==='missing_path') return '#f97316';
  return '#c084fc';
}

export function LivingAtlasMap({cityKey='cm-yaounde'}:{cityKey?:string}){
  const ref=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MapLibreMap|null>(null);
  const [data,setData]=useState<AtlasPayload>({});
  const [reach,setReach]=useState<ReachabilityPayload>({});
  const [busy,setBusy]=useState(false);
  const [layers,setLayers]=useState({provisional:true,corroborated:true,verified:true,candidates:true,observations:true,reachability:true});
  const [viewMode,setViewMode]=useState<'truth'|'uncertainty'|'evidence'>('truth');

  const load=async()=>{
    setBusy(true);
    const [atlasResult,reachResult]=await Promise.all([
      supabase.rpc('afat_living_atlas_map',{p_city_key:cityKey}),
      supabase.rpc('afat_reachability_map',{p_city_key:cityKey}),
    ]);
    setBusy(false);
    if(!atlasResult.error&&atlasResult.data) setData(atlasResult.data);
    if(!reachResult.error&&reachResult.data) setReach(reachResult.data);
  };
  useEffect(()=>{void load();},[cityKey]);

  useEffect(()=>{
    if(!ref.current) return;
    const map=new MapLibreMap({
      container:ref.current,center:[11.514,3.866],zoom:12.8,
      style:{version:8,sources:{base:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors © CARTO'}},layers:[{id:'base',type:'raster',source:'base'}]},
    });
    map.addControl(new NavigationControl({showCompass:true}),'bottom-right');
    mapRef.current=map;
    return()=>{map.remove();mapRef.current=null;};
  },[]);

  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const render=()=>{
      for(const id of ['atlas-edges','atlas-candidates','atlas-points','afat-destinations','afat-access-points','afat-meeting-points']){
        if(map.getLayer(id)) map.removeLayer(id);
        if(map.getSource(id)) map.removeSource(id);
      }
      const edges=(data.edges||[]).filter((e:any)=>{
        const s=e.evidence_status||'provisional';
        return (s==='provisional'&&layers.provisional)||(s==='corroborated'&&layers.corroborated)||(s==='verified'&&layers.verified)||(s==='disputed');
      }).map((e:any)=>({type:'Feature',properties:{id:e.id,name:e.name||'Unnamed road',confidence:Number(e.confidence||0),evidence_status:e.evidence_status||'provisional',passability:e.passability||'unknown',access_modes:(e.access_modes||[]).join(', '),mode_learning:e.mode_learning||[]},geometry:e.geometry}));
      if(edges.length){
        map.addSource('atlas-edges',{type:'geojson',data:{type:'FeatureCollection',features:edges} as any});
        map.addLayer({id:'atlas-edges',type:'line',source:'atlas-edges',paint:{
          'line-color':['match',['get','evidence_status'],'verified','#22c55e','corroborated','#38bdf8','disputed','#ef4444','#64748b'] as any,
          'line-width':['interpolate',['linear'],['zoom'],10,2,15,5] as any,
          'line-opacity':0.86,
          'line-dasharray':['case',['==',['get','evidence_status'],'provisional'],['literal',[2,2]],['literal',[1,0]]] as any,
        }});
      }
      const candidates=layers.candidates?(data.candidates||[]).map((c:any)=>({type:'Feature',properties:{id:c.id,status:c.status,confidence:Number(c.confidence||0),contributors:c.unique_contributors||0,evidence_count:c.evidence_count||0,feature_type:c.feature_type||'candidate'},geometry:c.geometry})):[];
      if(candidates.length){
        map.addSource('atlas-candidates',{type:'geojson',data:{type:'FeatureCollection',features:candidates} as any});
        map.addLayer({id:'atlas-candidates',type:'line',source:'atlas-candidates',paint:{
          'line-color':['match',['get','status'],'trusted','#a78bfa','corroborated','#f59e0b','#f97316'] as any,
          'line-width':5,'line-opacity':0.9,'line-dasharray':[1.5,1.5],
        }});
      }
      const points=layers.observations?(data.mapping_observations||[]).map((o:any)=>({type:'Feature',properties:{id:o.id,type:o.observation_type,label:o.label||o.observation_type,status:o.status,confidence:Number(o.confidence||0)},geometry:{type:'Point',coordinates:[Number(o.longitude),Number(o.latitude)]}})):[];
      if(points.length){
        map.addSource('atlas-points',{type:'geojson',data:{type:'FeatureCollection',features:points} as any});
        map.addLayer({id:'atlas-points',type:'circle',source:'atlas-points',paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],10,4,15,8] as any,
          'circle-color':['match',['get','type'],'informal_stop','#06b6d4','pickup_point','#06b6d4','entrance','#22c55e','landmark','#eab308','missing_road','#f97316','missing_path','#f97316','#c084fc'] as any,
          'circle-stroke-color':'#fff','circle-stroke-width':1.2,'circle-opacity':0.92,
        }});
      }
      if(layers.reachability){
        const destinations=(reach.destinations||[]).filter((p:any)=>Number.isFinite(Number(p.longitude))&&Number.isFinite(Number(p.latitude))).map((p:any)=>({type:'Feature',properties:{id:p.id,name:p.name||'Destination',place_ref:p.place_ref||'',kind:p.destination_kind||'place',reachability_state:p.reachability_state||'learning',evidence_status:p.evidence_status||'limited'},geometry:{type:'Point',coordinates:[Number(p.longitude),Number(p.latitude)]}}));
        if(destinations.length){
          map.addSource('afat-destinations',{type:'geojson',data:{type:'FeatureCollection',features:destinations} as any});
          map.addLayer({id:'afat-destinations',type:'circle',source:'afat-destinations',paint:{
            'circle-radius':['interpolate',['linear'],['zoom'],10,4,15,9] as any,
            'circle-color':['match',['get','reachability_state'],'strong','#22c55e','usable','#38bdf8','disputed','#ef4444','#f8fafc'] as any,
            'circle-stroke-color':'#0f172a','circle-stroke-width':2,'circle-opacity':0.95,
          }});
        }
        const access=(reach.access_points||[]).filter((p:any)=>Number.isFinite(Number(p.longitude))&&Number.isFinite(Number(p.latitude))).map((p:any)=>({type:'Feature',properties:{id:p.id,name:p.name||'Access point',type:p.access_type||'access',evidence_status:p.evidence_status||'limited',confidence:Number(p.confidence||0)},geometry:{type:'Point',coordinates:[Number(p.longitude),Number(p.latitude)]}}));
        if(access.length){
          map.addSource('afat-access-points',{type:'geojson',data:{type:'FeatureCollection',features:access} as any});
          map.addLayer({id:'afat-access-points',type:'circle',source:'afat-access-points',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,3,15,7] as any,'circle-color':'#a78bfa','circle-stroke-color':'#fff','circle-stroke-width':1.4,'circle-opacity':0.95}});
        }
        const meetings=(reach.meeting_points||[]).filter((p:any)=>Number.isFinite(Number(p.longitude))&&Number.isFinite(Number(p.latitude))).map((p:any)=>({type:'Feature',properties:{id:p.id,name:p.name||'Meeting point',type:p.point_type||'meeting',evidence_status:p.evidence_status||'limited',confidence:Number(p.confidence||0),successful_pickups:Number(p.successful_pickups||0),failed_pickups:Number(p.failed_pickups||0)},geometry:{type:'Point',coordinates:[Number(p.longitude),Number(p.latitude)]}}));
        if(meetings.length){
          map.addSource('afat-meeting-points',{type:'geojson',data:{type:'FeatureCollection',features:meetings} as any});
          map.addLayer({id:'afat-meeting-points',type:'circle',source:'afat-meeting-points',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,3,15,7] as any,'circle-color':'#f59e0b','circle-stroke-color':'#fff','circle-stroke-width':1.4,'circle-opacity':0.95}});
        }
      }
      const popup=(e:any)=>{
        const f=e.features?.[0]; if(!f)return;
        const p=f.properties||{};
        const ml=typeof p.mode_learning==='string'?JSON.parse(p.mode_learning||'[]'):p.mode_learning||[];
        const extra=Array.isArray(ml)&&ml.length?'<br/>'+ml.slice(0,3).map((x:any)=>`${x.mode}: ${x.traversals} traversals · ${Math.round(Number(x.confidence||0))}%`).join('<br/>'):'';
        const confidence=p.confidence==null||p.confidence===''?'':` · ${Math.round(Number(p.confidence||0))}%`;
        new Popup({closeButton:false,offset:10}).setLngLat(e.lngLat).setHTML(`<div style="font-size:12px"><strong>${p.name||p.label||p.feature_type||'AFAT evidence'}</strong><br/>${p.evidence_status||p.status||p.type||''}${confidence}${extra}</div>`).addTo(map);
      };
      ['atlas-edges','atlas-candidates','atlas-points','afat-destinations','afat-access-points','afat-meeting-points'].forEach(id=>{
        if(map.getLayer(id)){map.on('click',id,popup);map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});}
      });
    };
    if(map.loaded())render();else map.once('load',render);
  },[data,reach,layers]);

  const counts=useMemo(()=>({
    provisional:(data.edges||[]).filter((e:any)=>e.evidence_status==='provisional').length,
    corroborated:(data.edges||[]).filter((e:any)=>e.evidence_status==='corroborated').length,
    verified:(data.edges||[]).filter((e:any)=>e.evidence_status==='verified').length,
    candidates:(data.candidates||[]).length,
    observations:(data.mapping_observations||[]).length,
    destinations:(reach.destinations||[]).length,
    access:(reach.access_points||[]).length,
    meetings:(reach.meeting_points||[]).length,
  }),[data,reach]);

  const toggle=(k:keyof typeof layers)=>setLayers(x=>({...x,[k]:!x[k]}));
  const chooseMode=(mode:'truth'|'uncertainty'|'evidence')=>{
    setViewMode(mode);
    if(mode==='truth') setLayers({provisional:true,corroborated:true,verified:true,candidates:false,observations:false,reachability:true});
    if(mode==='uncertainty') setLayers({provisional:true,corroborated:false,verified:false,candidates:true,observations:false,reachability:true});
    if(mode==='evidence') setLayers({provisional:false,corroborated:true,verified:true,candidates:true,observations:true,reachability:true});
  };
  return <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/80 shadow-2xl">
    <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Living Atlas map</p><h2 className="mt-1 text-xl font-black">{data.city?.city_name||'City'} · {data.city?.learning_stage||'learning'} · {Math.round(Number(data.city?.operational_confidence||0))}%</h2></div>
      <button onClick={load} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[9px] font-black uppercase"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/>Refresh</button>
    </div>
    <div className="relative h-[68vh] min-h-[560px] xl:min-h-[680px]">
      <div ref={ref} className="absolute inset-0"/>
      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-2xl border border-white/10 bg-slate-950/88 p-3 shadow-xl backdrop-blur-xl">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(['truth','uncertainty','evidence'] as const).map(mode=><button key={mode} type="button" onClick={()=>chooseMode(mode)} className={`rounded-lg border px-3 py-1.5 text-[8px] font-black uppercase tracking-wider ${viewMode===mode?'border-cyan-300/30 bg-cyan-300/12 text-cyan-100':'border-white/10 bg-black/20 text-white/35'}`}>{mode}</button>)}
        </div>
        <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/55"><Layers3 className="h-4 w-4"/>Map layers</div>
        <div className="flex flex-wrap gap-2">
          <Layer label={`Provisional ${counts.provisional}`} active={layers.provisional} onClick={()=>toggle('provisional')}/>
          <Layer label={`Corroborated ${counts.corroborated}`} active={layers.corroborated} onClick={()=>toggle('corroborated')}/>
          <Layer label={`Verified ${counts.verified}`} active={layers.verified} onClick={()=>toggle('verified')}/>
          <Layer label={`Candidates ${counts.candidates}`} active={layers.candidates} onClick={()=>toggle('candidates')}/>
          <Layer label={`Field evidence ${counts.observations}`} active={layers.observations} onClick={()=>toggle('observations')}/>
          <Layer label={`Reachability ${counts.destinations}/${counts.access}/${counts.meetings}`} active={layers.reachability} onClick={()=>toggle('reachability')}/>
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-2xl border border-white/10 bg-slate-950/88 px-3 py-2 text-[9px] font-bold text-white/55 backdrop-blur-xl"><MapPinned className="mr-2 inline h-3.5 w-3.5 text-cyan-200"/>{viewMode==='truth'?'Truth view · what AFAT currently knows and how strongly it knows it.':viewMode==='uncertainty'?'Uncertainty view · where AFAT needs evidence next.':'Evidence view · observations and candidates behind the model.'}</div>
    </div>
  </section>;
}
function Layer({label,active,onClick}:{label:string;active:boolean;onClick:()=>void}){return <button type="button" onClick={onClick} className={`rounded-lg border px-2.5 py-1.5 text-[8px] font-black uppercase ${active?'border-cyan-300/20 bg-cyan-300/10 text-cyan-100':'border-white/10 bg-black/20 text-white/35'}`}>{label}</button>}
