#!/usr/bin/env node
// AFAT live operational routing acceptance. External GitHub runner verifies both
// Cameroon cities end to end: persistent OSRM → AFAT backend → passenger contract.
// Read-only: creates no user data, no paid routing calls, no synthetic evidence.
import assert from 'node:assert/strict';
const router=new URL(process.env.AFAT_ROUTER_URL||'https://afat-cameroon-osrm.onrender.com');
const backend=new URL(process.env.AFAT_API_URL||'https://asteck-bot.onrender.com');
for(const url of [router,backend])assert.equal(url.protocol,'https:');
const cities=[
 {city:'Yaounde',a:[11.516,3.866],b:[11.526,3.875]},
 {city:'Douala',a:[9.7679,4.0511],b:[9.77,4.058]},
];
const validPoint=p=>Array.isArray(p)&&p.length>=2&&p.every((x,i)=>i<2?Number.isFinite(x)&&Math.abs(x)<=(i===0?180:90):true);
async function getJson(url,retries=8){
 let last='';
 for(let attempt=1;attempt<=retries;attempt++){
  try{
   const response=await fetch(url,{headers:{'accept':'application/json'},signal:AbortSignal.timeout(45000)});
   const json=await response.json().catch(()=>null);
   if(response.ok&&json)return json;
   last='HTTP '+response.status+' '+JSON.stringify(json).slice(0,300);
  }catch(e){last=String(e);}
  if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw Error('Service did not return successful JSON at '+url.origin+url.pathname+': '+last);
}
for(const {city,a,b} of cities){
 const osrmUrl=new URL('/route/v1/driving/'+a.join(',')+';'+b.join(',')+'?overview=full&geometries=geojson&steps=true',router);
 const raw=await getJson(osrmUrl);
 assert.equal(raw.code,'Ok',city+' OSRM route unavailable');
 const candidate=raw.routes?.[0];
 assert.ok(candidate?.distance>0&&candidate?.duration>0&&candidate?.geometry?.type==='LineString'&&candidate.geometry.coordinates.length>=2&&candidate.geometry.coordinates.every(validPoint),city+' routing engine returned invalid path');
 assert.ok(candidate.legs?.[0]?.steps?.length>0,city+' no provider turn instructions');
 const args=new URLSearchParams({origin_lat:String(a[1]),origin_lon:String(a[0]),destination_lat:String(b[1]),destination_lon:String(b[0])});
 const apiUrl=new URL('/api/navigation/route?'+args,backend);
 const integrated=await getJson(apiUrl);
 assert.equal(integrated.source,'osrm',city+' AFAT backend not integrated with country engine');
 assert.equal(integrated.traffic_aware,false,city+' cannot claim live traffic');
 const route=integrated.primary;
 assert.ok(route?.distanceMeters>0&&route?.durationValue>0&&route.geometry?.type==='LineString'&&route.geometry.coordinates.length>=2&&route.geometry.coordinates.every(validPoint),city+' AFAT navigation did not return actual route geometry');
 assert.ok(Array.isArray(route.maneuvers)&&route.maneuvers.length>0,city+' AFAT failed to preserve provider geolocated maneuvers');
 assert.ok(route.maneuvers.every(m=>Number.isFinite(m.latitude)&&Number.isFinite(m.longitude)&&typeof m.instruction==='string'&&m.instruction.length>0),city+' invalid actual directions');
 // Geometric and distance continuity: backend must not substitute another route.
 assert.ok(Math.abs(route.distanceMeters-candidate.distance)<Math.max(50,candidate.distance*0.04),city+' backend distance differs materially from OSRM result');
 console.log(city+': LIVE OSRM→AFAT path '+Math.round(route.distanceMeters)+' m / '+Math.round(route.durationValue)+' sec; '+route.geometry.coordinates.length+' GPS geometry points, '+route.maneuvers.length+' provider maneuvers (baseline ETA; no field/traffic validation)');
}
// Validate an actual public geospatial discovery → destination → road route.
// Choose an eligible place returned by the current live database, never a fixture.
const sourceOrigin={latitude:3.866,longitude:11.516};
const nearbyUrl=new URL('/api/atlas/nearby?'+new URLSearchParams({lat:String(sourceOrigin.latitude),lon:String(sourceOrigin.longitude),radius_m:'3000',limit:'20'}),backend);
const discovery=await getJson(nearbyUrl);
assert.equal(discovery.place_candidates_status,'ok','Actual source-licensed geographic lookup is unavailable');
const discovered=Array.isArray(discovery.place_candidates)?discovery.place_candidates:[];
assert.ok(discovered.length>0,'No actual Yaounde places were returned; cannot accept Find→Reach');
let acceptedPlace=null;
let lastCandidateError='';
for(const place of discovered.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Number.isFinite(p.distance_m)&&p.distance_m>=120).slice(0,12)){
 assert.ok(['limited','corroborated','verified','field_verified'].includes(place.evidence_status),'Unreviewed source record was represented as reviewed geographic truth');
 assert.equal(place.verified_access,false,'A source place must not automatically certify its entrance');
 assert.ok(['overture_maps','openstreetmap'].includes(place.source_key),'Non-licensed source leaked into public discovery');
 const params=new URLSearchParams({origin_lat:String(sourceOrigin.latitude),origin_lon:String(sourceOrigin.longitude),destination_lat:String(place.latitude),destination_lon:String(place.longitude)});
 try{
  const result=await getJson(new URL('/api/navigation/route?'+params,backend),1);
  const route=result.primary;
  if(result.source!=='osrm'||route?.distanceMeters<=0||route?.geometry?.type!=='LineString'||route.geometry.coordinates.length<2||!Array.isArray(route.maneuvers)||!route.maneuvers.length)continue;
  const last=route.geometry.coordinates.at(-1);
  const latDelta=(last[1]-place.latitude)*111000;
  const lonDelta=(last[0]-place.longitude)*111000*Math.cos(place.latitude*Math.PI/180);
  const roadSnapDistanceM=Math.hypot(latDelta,lonDelta);
  // A 500m mismatch may be a legitimate absent access road, but is NOT accepted
  // as safely reaching that destination. Look for a better proven candidate.
  if(roadSnapDistanceM>500){lastCandidateError='Road route ends '+Math.round(roadSnapDistanceM)+' m from '+place.name;continue;}
  acceptedPlace={name:place.name,id:place.id,source:place.source_key,evidence:place.evidence_status,distance:route.distanceMeters,snapDistance:roadSnapDistanceM,turns:route.maneuvers.length};
  break;
 }catch(e){lastCandidateError=String(e).slice(0,200);}
}
assert.ok(acceptedPlace,'No actual licensed place could be routed to on the live Cameroon graph. '+lastCandidateError);
console.log('FIND→REACH actual source place: '+JSON.stringify(acceptedPlace)+' · route access/entrance remains unverified');
console.log('PASS AFAT production two-city road routing AND real licensed-place discovery→routing integration (no field validation)');

