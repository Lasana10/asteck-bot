#!/usr/bin/env node
// Production-only, read-only AFAT Cameroon pedestrian mobility acceptance.
// Every route comes from the separately compiled OSM foot network, never the car graph.
import assert from 'node:assert/strict';

const backend=new URL(process.env.AFAT_API_URL||'https://asteck-bot.onrender.com');
const walking=new URL(process.env.AFAT_WALK_OSRM_URL||'https://afat-cameroon-foot-osrm.onrender.com');
assert.equal(backend.protocol,'https:');assert.equal(walking.protocol,'https:');
const cityPairs=[
 {city:'Yaounde',start:[11.516,3.866],destination:[11.517,3.867]},
 {city:'Douala',start:[9.7679,4.0511],destination:[9.769,4.052]},
];
async function json(url,{retries=7}={}){
 let last='not reached';
 for(let attempt=0;attempt<retries;attempt++){
  try{
   const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(35000)});
   const value=await response.json().catch(()=>null);
   if(response.ok&&value)return value;
   last='HTTP '+response.status+' '+JSON.stringify(value).slice(0,220);
  }catch(e){last=String(e);}
  if(attempt<retries-1)await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error('Live service unavailable: '+url.origin+url.pathname+': '+last);
}
const pathOk=route=>route&&route.distance>0&&route.duration>0&&route.geometry?.type==='LineString'&&
 Array.isArray(route.geometry.coordinates)&&route.geometry.coordinates.length>=2&&
 route.geometry.coordinates.every(p=>Array.isArray(p)&&p.length>=2&&p.every((x,i)=>i<2&&Number.isFinite(x)&&Math.abs(x)<=(i===0?180:90)));
for(const {city,start,destination} of cityPairs){
 const url=new URL('/route/v1/foot/'+start.join(',')+';'+destination.join(',')+'?overview=full&geometries=geojson&steps=true',walking);
 const raw=await json(url);assert.equal(raw.code,'Ok');
 assert.ok(pathOk(raw.routes?.[0]),city+': live foot network did not supply a usable route');
 const native=raw.routes[0];
 const walkingSpeed=native.distance/native.duration*3.6;
 assert.ok(walkingSpeed>0.5&&walkingSpeed<12,city+': graph is not using a human walking profile');
 const params=new URLSearchParams({mode:'foot',origin_lat:String(start[1]),origin_lon:String(start[0]),
  destination_lat:String(destination[1]),destination_lon:String(destination[0])});
 const response=await json(new URL('/api/navigation/route?'+params,backend));
 assert.equal(response.travel_mode,'foot',city+': backend did not preserve walking profile');
 assert.equal(response.source,'osrm',city+': walking must come from independently profiled OSM');
 assert.equal(response.traffic_aware,false,'OSRM does not provide live traffic evidence');
 assert.ok(response.primary?.geometry?.coordinates?.length>=2&&response.primary?.distanceMeters>0&&
  response.primary?.durationValue>0,city+': backend lacks real foot geometry');
 assert.ok(Math.abs(response.primary.distanceMeters-native.distance)<Math.max(15,native.distance*.03),city+': route differs from real walking graph');
 assert.ok(Array.isArray(response.primary.maneuvers)&&response.primary.maneuvers.length,city+': no true foot navigation instructions');
 console.log(city+': LIVE pedestrian route '+Math.round(native.distance)+' m, '+Math.round(native.duration)+' sec; '+
  response.primary.maneuvers.length+' walking maneuvers, foot speed '+walkingSpeed.toFixed(2)+' km/h');
}
// Real Find → Reach: pick actual licensed POI, never invent a target or entrance.
const origin={lat:3.866,lon:11.516};
const source=await json(new URL('/api/atlas/nearby?lat=3.866&lon=11.516&radius_m=3000&limit=30',backend));
assert.equal(source.place_candidates_status,'ok','Live source-licensed place search failed');
const candidates=Array.isArray(source.place_candidates)?source.place_candidates:[];
let accepted=null;
for(const p of candidates.filter(x=>x&&Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&
  x.distance_m>100&&x.verified_access===false&&['openstreetmap','overture_maps'].includes(x.source_key)).slice(0,12)){
 const params=new URLSearchParams({mode:'foot',origin_lat:String(origin.lat),origin_lon:String(origin.lon),destination_lat:String(p.latitude),destination_lon:String(p.longitude)});
 try{
  const result=await json(new URL('/api/navigation/route?'+params,backend),{retries:1});
  if(result.travel_mode!=='foot'||result.source!=='osrm'||!result.primary?.geometry?.coordinates?.length)continue;
  const end=result.primary.geometry.coordinates.at(-1);
  const gap=Math.hypot((end[1]-p.latitude)*111000,(end[0]-p.longitude)*111000*Math.cos(p.latitude*Math.PI/180));
  if(gap>600)continue;
  accepted={place:p.name,source:p.source_key,status:p.evidence_status,route_m:Math.round(result.primary.distanceMeters),last_meter_gap_m:Math.round(gap)};
  break;
 }catch{}
}
assert.ok(accepted,'No actual source-licensed Yaounde place connected to the foot graph within a bounded road snap.');
console.log('FIND→WALK using real limited-evidence destination: '+JSON.stringify(accepted));
console.log('PASS Cameroon independent walking network → real AFAT backend → pedestrian geometry/maneuvers → actual place destination; physical crossing/entrance/accessibility not verified');
