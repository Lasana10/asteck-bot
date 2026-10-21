import React,{useState} from 'react';
import {discoverAfatPlaces,type AfatPlaceCandidate} from '../../supabaseClient';
import {publishScheduledDeparture} from '../../services/operatorDeparturePublisher';
type Point=Pick<AfatPlaceCandidate,'id'|'name'|'latitude'|'longitude'>;
type Kind='origin'|'destination';

export function ScheduledDeparturePublisher({vehicle,city='yaounde',onPublished}:{
 vehicle:{id:string;type?:string|null;capacity?:number|null;clearance_status?:string|null}|null;
 city?:string;onPublished:()=>void;
}){
 const [expanded,setExpanded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [originQuery,setOriginQuery]=useState('');
 const [destinationQuery,setDestinationQuery]=useState('');
 const [originCity,setOriginCity]=useState(city);
 const [destinationCity,setDestinationCity]=useState(city);
 const [origin,setOrigin]=useState<Point|null>(null);
 const [destination,setDestination]=useState<Point|null>(null);
 const [options,setOptions]=useState<AfatPlaceCandidate[]>([]);
 const [searching,setSearching]=useState<Kind|null>(null);
 const [departAt,setDepartAt]=useState('');
 const [fare,setFare]=useState('');
 const [lookupKind,setLookupKind]=useState<Kind>('origin');

 const search=async(kind:Kind)=>{
  const query=(kind==='origin'?originQuery:destinationQuery).trim();
  if(query.length<2)return;
  setBusy(true);setSearching(kind);setLookupKind(kind);setNotice('');
  const {data,error}=await discoverAfatPlaces({query,city:kind==='origin'?originCity:destinationCity,limit:12});
  setBusy(false);setSearching(null);
  if(error){setOptions([]);setNotice(error.message);return;}
  const found=(data?.results||[]).filter((p:AfatPlaceCandidate)=>
    p?.id&&p?.name&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)) &&
    Math.abs(Number(p.latitude))<=90&&Math.abs(Number(p.longitude))<=180);
  setOptions(found);
  if(!found.length)setNotice('No real source-mapped location matched. Search a landmark or nearby area instead.');
 };
 const choose=(point:AfatPlaceCandidate)=>{
  const value:Point={id:point.id,name:point.name,latitude:Number(point.latitude),longitude:Number(point.longitude)};
  if(lookupKind==='origin'){setOrigin(value);setOriginQuery(value.name);}
  else{setDestination(value);setDestinationQuery(value.name);}
  setOptions([]);
 };
 const publish=async()=>{
  if(!vehicle||vehicle.clearance_status!=='verified'){
    setNotice('The operator must have a verified vehicle before publishing a departure.');return;
  }
  if(!origin||!destination){setNotice('Select both boarding and destination places from actual geographic discovery.');return;}
  const instant=Date.parse(departAt),amount=Number(fare);
  if(!Number.isFinite(instant)||!Number.isSafeInteger(amount)||amount<=0){
    setNotice('Enter a real departure date/time and a valid published fare in XAF.');return;
  }
  setBusy(true);setNotice('');
  const {data,error}=await publishScheduledDeparture({
    vehicle_id:vehicle.id,origin:origin.name,destination:destination.name,
    origin_lat:origin.latitude,origin_lng:origin.longitude,
    dest_lat:destination.latitude,dest_lng:destination.longitude,
    departure_time:new Date(instant).toISOString(),price_per_seat:amount,
  });
  setBusy(false);
  if(error){setNotice(error.message);return;}
  setNotice(`Scheduled departure published · ${data.departure.id}. Seats are provisional until passenger holds succeed. Boarding/access remains unverified.`);
  setDepartAt('');setFare('');onPublished();
 };
 const placeField=(kind:Kind)=>{
  const isOrigin=kind==='origin';
  const selected=isOrigin?origin:destination;
  const query=isOrigin?originQuery:destinationQuery;
  return <div className="space-y-2">
   <label className="block text-[10px] font-bold text-white/65">{isOrigin?'Boarding landmark / point':'Arrival landmark / point'}</label>
   <div className="flex gap-2">
    <input value={isOrigin?originCity:destinationCity}
      onChange={e=>{isOrigin?setOriginCity(e.target.value):setDestinationCity(e.target.value);isOrigin?setOrigin(null):setDestination(null);}}
      placeholder="City" aria-label={isOrigin?'Boarding city':'Destination city'}
      className="min-h-10 w-24 rounded-lg border border-white/10 bg-slate-950 px-2 text-xs"/>
    <input value={query} placeholder={isOrigin?'Real departure landmark':'Real arrival landmark'}
      onChange={e=>{isOrigin?setOriginQuery(e.target.value):setDestinationQuery(e.target.value);isOrigin?setOrigin(null):setDestination(null);setOptions([]);}}
      className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs"/>
    <button disabled={busy||query.trim().length<2} onClick={()=>void search(kind)}
      className="min-h-10 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs text-cyan-100 disabled:opacity-40">
      {searching===kind?'…':'Find'}</button>
   </div>
   {selected&&<p className="text-[10px] text-emerald-200">Source-mapped: {selected.name} · exact boarding/access not independently verified</p>}
   {lookupKind===kind&&options.length>0&&<div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-white/10 p-2">
    {options.map(p=><button key={p.id} onClick={()=>choose(p)} className="block w-full rounded-lg p-2 text-left text-xs hover:bg-white/10">{p.name} <span className="text-white/40">· {p.city||''} · source mapping only</span></button>)}
   </div>}
  </div>;
 };
 return <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
  <div className="flex items-start justify-between gap-4">
   <div><p className="text-[9px] font-black uppercase tracking-wider text-cyan-200">Scheduled transport supply</p>
    <h2 className="mt-2 text-lg font-black">Publish a real future departure</h2>
    <p className="mt-2 text-xs leading-5 text-white/50">For an approved operator and verified vehicle. Select real mapped places, set your own departure and fare. The boarding point is operator-reported, not automatically certified as an entrance or safe route.</p></div>
   <button onClick={()=>setExpanded(v=>!v)} className="min-h-10 shrink-0 rounded-lg border border-white/15 px-3 text-xs">{expanded?'Close':'Publish'}</button>
  </div>
  {expanded&&<div className="mt-4 space-y-4">
   {!vehicle||vehicle.clearance_status!=='verified'?<p className="rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100">Vehicle clearance is required before this schedule can be published.</p>:null}
   {placeField('origin')}{placeField('destination')}
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-[10px] font-semibold text-white/65">Actual departure time
      <input type="datetime-local" value={departAt} onChange={e=>setDepartAt(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-xs text-white"/></label>
    <label className="text-[10px] font-semibold text-white/65">Published fare · XAF per seat
      <input inputMode="numeric" value={fare} onChange={e=>setFare(e.target.value)} placeholder="e.g. 3500" className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-xs text-white"/></label>
   </div>
   <p className="text-[10px] text-white/45">Vehicle capacity: {vehicle?.capacity??'pending verification'} seats. An operator may schedule only their verified vehicle; AFAT prevents close scheduling conflicts and confirms capacity again when a passenger holds a seat.</p>
   {notice&&<p role="status" className="rounded-lg border border-white/10 p-3 text-xs text-white/75">{notice}</p>}
   <button type="button" disabled={busy||vehicle?.clearance_status!=='verified'||!origin||!destination||!departAt||!fare} onClick={()=>void publish()}
     className="min-h-12 w-full rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">Publish verified-operator departure</button>
  </div>}
  {!expanded&&notice&&<p role="status" className="mt-3 text-xs text-white/65">{notice}</p>}
 </section>;
}
