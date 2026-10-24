import React,{useEffect,useState} from 'react';
import {AtlasFieldMissionReview} from './AtlasFieldMissionReview';
import {AlertTriangle,MapPinned,RefreshCw,SearchCheck} from 'lucide-react';
import {fetchCrossSourceRoadChecks,requestCrossSourceFieldCheck,type CrossSourceRoadReview,type CrossSourceRoadCheck} from '../../services/livingAtlasClient';
import {supabase} from '../../supabaseClient';

/** Planner-only source disagreement intelligence. Source data is not road truth. */
export function AtlasSourceDisagreementDesk(){
 const [cityKey,setCityKey]=useState('');
 const [cities,setCities]=useState<Array<{city_key:string;city_name:string}>>([]);
 const [review,setReview]=useState<CrossSourceRoadReview|null>(null);
 const [loading,setLoading]=useState(true);
 const [acting,setActing]=useState<string|null>(null);
 const [reason,setReason]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  let mounted=true;
  void supabase.from('afat_city_profiles').select('city_key,city_name')
   .eq('status','active').order('city_name').then(({data,error})=>{
    if(!mounted)return;
    setLoading(false);
    if(error){setNotice('City coverage registry unavailable: source comparison disabled.');return;}
    const list=(data||[]) as Array<{city_key:string;city_name:string}>;
    setCities(list);setCityKey(old=>list.some(v=>v.city_key===old)?old:(list[0]?.city_key||''));
   });
  return()=>{mounted=false;};
 },[]);
 const refresh=async(key:string)=>{
  if(!key)return;
  setLoading(true);setNotice('');
  const {data,error}=await fetchCrossSourceRoadChecks(key,20);
  setLoading(false);
  if(error){setReview(null);setNotice(error.message||'Could not crosscheck licensed source geometry.');return;}
  setReview(data as CrossSourceRoadReview);
 };
 useEffect(()=>{void refresh(cityKey);},[cityKey]);
 const create=async(item:CrossSourceRoadCheck)=>{
  if(!item.can_request_field_check||!item.atlas_edge_id||acting)return;
  const notes=String(reason[item.source_record_id]||'').trim();
  if(notes.length<25){setNotice('Explain which actual source discrepancy merits a field check in at least 25 characters.');return;}
  setActing(item.source_record_id);setNotice('');
  const {data,error}=await requestCrossSourceFieldCheck(item.source_record_id,cityKey,notes);
  setActing(null);
  if(error){setNotice(error.message||'Field check request rejected.');await refresh(cityKey);return;}
  setReason(old=>({...old,[item.source_record_id]:''}));
  setNotice(data?.created?'Real Atlas edge field mission created for optional human checking. No road is automatically certified.':'This corridor already has an open or claimed mission. No duplicate was created.');
  await refresh(cityKey);
 };
 return <section className="rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/70 p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-[9px] font-black uppercase tracking-widest text-cyan-200">Licensed mapping intelligence · source disagreement</p>
    <h3 className="mt-2 text-lg font-black">Where independent maps disagree</h3>
    <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">Compare existing OpenStreetMap and Overture road records within reviewed city coverage. Source discrepancies create questions for human fieldwork—not road closures, traffic alerts or automatic navigation changes.</p></div>
   <div className="flex flex-wrap items-center gap-2">
    <select aria-label="City source comparison" value={cityKey} disabled={loading||acting!==null} onChange={e=>setCityKey(e.target.value)} className="min-h-10 rounded-xl border border-white/15 bg-slate-950 px-3 text-xs">
     {cities.map(city=><option key={city.city_key} value={city.city_key}>{city.city_name}</option>)}
    </select>
    <button type="button" onClick={()=>void refresh(cityKey)} disabled={!cityKey||loading||acting!==null} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs disabled:opacity-40"><RefreshCw className="h-4 w-4"/>Refresh</button>
   </div>
  </div>
  {review&&<div className="mt-4 grid grid-cols-3 gap-3">
   <div className="rounded-xl border border-white/10 p-3"><p className="text-lg font-black">{review.source_records_compared}</p><p className="text-[10px] text-white/50">Road source records examined</p></div>
   <div className="rounded-xl border border-white/10 p-3"><p className="text-lg font-black">{review.discrepancy_count}</p><p className="text-[10px] text-white/50">Spatial or category differences</p></div>
   <div className="rounded-xl border border-white/10 p-3"><p className="text-lg font-black">{review.actionable_count}</p><p className="text-[10px] text-white/50">Anchored, unclaimed field checks</p></div>
  </div>}
  <div className="mt-4 space-y-3">
   {(review?.discrepancies||[]).map(item=><article key={item.source_record_id} className="rounded-xl border border-white/10 bg-black/25 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><p className="text-sm font-bold text-white">{item.feature_name||'Unnamed mapped road candidate'}</p>
      <p className="mt-1 text-[11px] text-white/55">{item.source_key} · {item.feature_category||'unclassified'} · {item.discrepancy_type.replace(/_/g,' ')}</p>
      {item.nearby_source_key&&<p className="mt-1 text-[10px] text-cyan-100/60">Nearby {item.nearby_source_key} category: {item.nearby_category||'unspecified'} ({item.nearest_source_distance_m} m)</p>}
      <p className="mt-1 text-[10px] text-white/40">Mapped position {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} · Attribution: {item.attribution||item.source_key}</p>
      <p className="mt-1 text-[10px] text-white/40">{item.atlas_edge_id?'Anchored near existing Atlas edge':'No existing Atlas edge nearby; review map source separately'}</p>
     </div>
     <span className="rounded-full border border-amber-300/20 px-3 py-1 text-[9px] font-bold text-amber-100">{item.existing_mission_id?'Existing field mission':'Source hypothesis only'}</span>
    </div>
    {item.can_request_field_check?<div className="mt-3">
     <label className="block text-[10px] text-white/60">Your independent reason for requesting human verification
      <textarea rows={2} value={reason[item.source_record_id]||''} maxLength={1500} onChange={e=>setReason(old=>({...old,[item.source_record_id]:e.target.value}))} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-xs" placeholder="Which mapped sources disagree, and what must be checked in person?"/></label>
     <button type="button" onClick={()=>void create(item)} disabled={acting!==null||(reason[item.source_record_id]||'').trim().length<25} className="mt-2 flex min-h-10 items-center gap-2 rounded-lg bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-35"><MapPinned className="h-4 w-4"/>Request a real field check</button>
    </div>:null}
   </article>)}
   {review&&!review.discrepancies.length&&<p className="rounded-xl border border-white/10 p-4 text-xs text-white/60"><SearchCheck className="mr-1 inline h-4 w-4"/>No reviewable differences found within this active city's available source records.</p>}
  </div>
  <AtlasFieldMissionReview />
  {notice&&<p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0"/>{notice}</p>}
  <p className="mt-4 text-[10px] leading-5 text-white/40">35 m source-neighbour comparison, 80 m Atlas edge anchoring. Source classifications are not directly equivalent; counts include potential false discrepancies. Field evidence and independent review remain mandatory.</p>
 </section>;
}
