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
console.log('PASS AFAT operational Cameroon two-city origin→backend→OSRM→geometry/maneuvers integration (no real-device field validation)');
