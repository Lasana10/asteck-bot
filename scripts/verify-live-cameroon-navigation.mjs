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
 assert.equal(integrated.travel_mode,'driving',city+' backend did not preserve driving mode identity');
 assert.equal(integrated.source,'osrm',city+' AFAT backend not integrated with country engine');
 assert.equal(integrated.traffic_aware,false,city+' cannot claim live traffic');
 const route=integrated.primary;
 assert.ok(route?.distanceMeters>0&&route?.durationValue>0&&route.geometry?.type==='LineString'&&route.geometry.coordinates.length>=2&&route.geometry.coordinates.every(validPoint),city+' AFAT navigation did not return actual route geometry');
 assert.ok(Array.isArray(route.maneuvers)&&route.maneuvers.length>0,city+' AFAT failed to preserve provider geolocated maneuvers');
 assert.ok(Number.isFinite(route.originSnapMeters)&&route.originSnapMeters>=0&&
   Number.isFinite(route.destinationSnapMeters)&&route.destinationSnapMeters>=0,
   city+' AFAT lost actual OSRM road-network snapping evidence');
 assert.ok(route.maneuvers.every(m=>Number.isFinite(m.latitude)&&Number.isFinite(m.longitude)&&typeof m.instruction==='string'&&m.instruction.length>0),city+' invalid actual directions');
 // Geometric and distance continuity: backend must not substitute another route.
 assert.ok(Math.abs(route.distanceMeters-candidate.distance)<Math.max(50,candidate.distance*0.04),city+' backend distance differs materially from OSRM result');
 console.log(city+': LIVE OSRM→AFAT path '+Math.round(route.distanceMeters)+' m / '+Math.round(route.durationValue)+' sec; '+route.geometry.coordinates.length+' GPS geometry points, '+route.maneuvers.length+' provider maneuvers (baseline ETA; no field/traffic validation)');
}
// The same passenger backend must never relabel a driving graph as walking.
// An unavailable foot service is an honest 503, not a fake successful journey.
for(const {city,a,b} of cities){
 const params=new URLSearchParams({
  origin_lat:String(a[1]),origin_lon:String(a[0]),
  destination_lat:String(b[1]),destination_lon:String(b[0]),mode:'foot'
 });
 const url=new URL('/api/navigation/route?'+params,backend);
 const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(45000)});
 const body=await response.json().catch(()=>null);
 if(response.status===503){
  assert.equal(body?.code,'ROUTING_UNAVAILABLE',city+' walking unavailable must fail with explicit unavailable status');
  console.log(city+': passenger pedestrian route NOT deployed; backend fails closed without inventing walking geometry');
 } else {
  assert.equal(response.status,200,city+' walking response invalid: '+response.status);
  assert.equal(body?.travel_mode,'foot',city+' backend mislabels walking mode');
  assert.equal(body?.source,'osrm',city+' pedestrian route must use real foot OSRM');
  const route=body?.primary;
  assert.ok(route?.distanceMeters>0&&route?.durationValue>0&&
    route?.geometry?.type==='LineString'&&route.geometry.coordinates.length>=2&&
    route.geometry.coordinates.every(validPoint),city+' passenger pedestrian geometry invalid');
  const kmh=3.6*route.distanceMeters/route.durationValue;
  assert.ok(kmh>0.5&&kmh<12,city+' walking engine returned non-walking speed');
  console.log(city+': live passenger pedestrian geometry '+Math.round(route.distanceMeters)+' m; crossings and accessibility unverified');
 }
}
// Validate an actual public geospatial discovery → destination → road route.
// Choose an eligible place returned by the current live database, never a fixture.
const sourceOrigin={latitude:3.866,longitude:11.516};
const nearbyUrl=new URL('/api/atlas/nearby?'+new URLSearchParams({lat:String(sourceOrigin.latitude),lon:String(sourceOrigin.longitude),radius_m:'3000',limit:'20'}),backend);
const discovery=await getJson(nearbyUrl);
assert.equal(discovery.place_candidates_status,'ok','Actual source-licensed geographic lookup is unavailable');
const discovered=Array.isArray(discovery.place_candidates)?discovery.place_candidates:[];
assert.ok(discovered.length>0,'No actual Yaounde places were returned; cannot accept Find→Reach');
const meaningful=discovered.filter(p=>!['road','transportation_connector'].includes(p.place_type));
assert.ok(meaningful.length>=10,'Source search is overwhelmed by generic road connectors instead of actual destinations');
assert.ok(!['road','transportation_connector'].includes(discovered[0]?.place_type),'Nearby Find ranks a routing connector ahead of useful destinations');
let acceptedPlace=null;
let lastCandidateError='';
for(const place of meaningful.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Number.isFinite(p.distance_m)&&p.distance_m>=120).slice(0,16)){
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
  if(roadSnapDistanceM>500 || !Number.isFinite(route.destinationSnapMeters) || route.destinationSnapMeters>500){lastCandidateError='Road route ends '+Math.round(roadSnapDistanceM)+' m from '+place.name;continue;}
  acceptedPlace={name:place.name,kind:place.place_type,id:place.id,source:place.source_key,evidence:place.evidence_status,distance:route.distanceMeters,snapDistance:roadSnapDistanceM,providerSnapMeters:route.destinationSnapMeters,turns:route.maneuvers.length};
  break;
 }catch(e){lastCandidateError=String(e).slice(0,200);}
}
assert.ok(acceptedPlace,'No actual licensed place could be routed to on the live Cameroon graph. '+lastCandidateError);
console.log('FIND→REACH actual source place: '+JSON.stringify(acceptedPlace)+' · route access/entrance remains unverified');

// Continue from verified real destination → routing into the existing optional
// approved-operator supply → seat-hold → booking path, without creating bookings.
const departureUrl=new URL('/api/mobility/departures',backend);
const published=await getJson(departureUrl,2);
assert.equal(published.success,true,'AFAT public approved operator departure feed unavailable');
assert.ok(Array.isArray(published.departures),'AFAT departure feed missing genuine inventory array');
for(const departure of published.departures){
 const leavesAt=Date.parse(departure.departure_time);
 assert.ok(Number.isFinite(leavesAt)&&leavesAt>Date.now(),'Old/unscheduled departure exposed as bookable');
 assert.ok(typeof departure.id==='string'&&departure.id.length>0,'Departure missing real route identifier');
 assert.ok(Number.isSafeInteger(departure.price_xaf)&&departure.price_xaf>0,'Invalid advertised XAF fare');
 assert.ok(Number.isSafeInteger(departure.total_seats)&&departure.total_seats>=1,'Invalid vehicle capacity');
 assert.ok(Number.isSafeInteger(departure.booked_seats)&&departure.booked_seats>=0,'Invalid booked seat inventory');
 assert.equal(departure.available_seats,departure.total_seats-departure.booked_seats,
   'Departure seat availability not consistent with current bookings');
 assert.ok(departure.available_seats>0,'Sold-out departure incorrectly shown as bookable');
 assert.ok(Array.isArray(departure.occupied_seats),'Occupancy labels unavailable');
 assert.ok(departure.inventory_note?.includes('seat hold'),'Passenger inventory not clearly provisional');
 for(const secret of ['passenger_id','payment_token','payment_reference','passenger_phone']){
  assert.equal(Object.hasOwn(departure,secret),false,'Private booking data exposed by public departure feed');
 }
}
console.log('Production approved future operator departures:',published.departures.length,
 published.departures.length?'real operator supply published':'NO ACTIVE SUPPLY: full operator booking cannot be operationally accepted');

// No real booking or reservation is created here. Anonymous callers must
// reach the authorization gate before any mutation.
for(const path of ['/api/booking/seat-hold','/api/booking/create-from-hold']){
 const response=await fetch(new URL(path,backend),{
  method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
  body:JSON.stringify({hold_id:'00000000-0000-0000-0000-000000000000',
    route_id:'00000000-0000-0000-0000-000000000000',seat_label:'1'}),
  signal:AbortSignal.timeout(25000),
 });
 assert.equal(response.status,401,'Unauthenticated passenger mutation not protected: '+path);
 console.log('PASS anonymous booking mutation denied:',path,'HTTP',response.status);
}

// Test real production auth boundaries without registering vehicles or
// supplying compliance documents. A 404 means backend is stale, NOT accepted.
for(const item of [
 {path:'/api/onboard/vehicle/register',method:'POST',payload:{plate_number:'NOT-A-REAL-REGISTRATION',vehicle_type:'taxi',capacity:4}},
 {path:'/api/mobility/departures/publish',method:'POST',payload:{vehicle_id:'00000000-0000-0000-0000-000000000000'}},
 {path:'/api/mobility/vehicle-clearance/queue',method:'GET'},
 {path:'/api/mobility/vehicle-clearance/00000000-0000-0000-0000-000000000000/review',method:'POST',payload:{decision:'verified',reason:'no genuine evidence or authorization'}},
]){
 const response=await fetch(new URL(item.path,backend),{
  method:item.method,
  headers:{accept:'application/json','content-type':'application/json'},
  ...(item.method==='POST'?{body:JSON.stringify(item.payload)}:{}),
  signal:AbortSignal.timeout(25000),
 });
 assert.equal(response.status,401,'Unauthenticated vehicle/operator mutation or protected queue not denied (404 indicates stale backend): '+item.path);
 console.log('PASS production anonymous fleet/approval boundary:',item.path,'HTTP 401');
}

// Private operator document custody belongs to authenticated operator/staff
// identities only. Probe deployed routes without files or mutations. A missing
// backend route (404) must not pass release acceptance.
const dummyCompliance='00000000-0000-0000-0000-000000000000';
for(const item of [
 {path:'/api/compliance/operator/ensure-required',method:'POST',body:{}},
 {path:'/api/compliance/'+dummyCompliance+'/upload-authorize',method:'POST',body:{mime_type:'application/pdf',bytes:1234}},
 {path:'/api/compliance/'+dummyCompliance+'/upload-confirm',method:'POST',body:{path:'not-an-owned-file'}},
 {path:'/api/compliance/'+dummyCompliance+'/review-file',method:'GET'},
]){
 const response=await fetch(new URL(item.path,backend),{
  method:item.method,headers:{accept:'application/json','content-type':'application/json'},
  ...(item.method==='POST'?{body:JSON.stringify(item.body)}:{}),
  signal:AbortSignal.timeout(25000),
 });
 assert.equal(response.status,401,'Private operator evidence endpoint not protected or undeployed: '+item.path);
 console.log('PASS live private evidence authentication boundary:',item.path,'HTTP 401');
}

console.log('PASS AFAT production two-city road routing AND real licensed-place discovery→routing integration (no field validation)');

