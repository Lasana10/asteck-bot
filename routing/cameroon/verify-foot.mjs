import assert from 'node:assert/strict';
const base=process.env.AFAT_WALK_OSRM_URL||'http://127.0.0.1:5000';
for(const {city,a,b} of [
 {city:'Yaounde',a:[11.516,3.866],b:[11.517,3.867]},
 {city:'Douala',a:[9.7679,4.0511],b:[9.769,4.052]},
]){
 const url=new URL('/route/v1/foot/'+a.join(',')+';'+b.join(',')+'?overview=full&geometries=geojson&steps=true',base);
 const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
 assert.equal(response.status,200,city+' pedestrian endpoint status');
 const data=await response.json(),r=data.routes?.[0];
 assert.equal(data.code,'Ok',city+' has no pedestrian route');
 assert.ok(r?.distance>0 && r?.duration>0,city+' route must have positive distance and duration');
 assert.ok(r.geometry?.type==='LineString'&&r.geometry.coordinates.length>=2,city+' requires real OSM graph coordinates');
 assert.ok(r.legs?.[0]?.steps?.length,city+' has no walking maneuvers');
 const kmh=r.distance/r.duration*3.6;
 assert.ok(kmh>0.5 && kmh<12,city+' route speed inconsistent with walking profile: '+kmh.toFixed(2));
 console.log(city+': real walking OSRM '+Math.round(r.distance)+' m, '+Math.round(r.duration)+' s, '+r.geometry.coordinates.length+' coordinates, walking speed '+kmh.toFixed(2)+' km/h; sidewalk safety is not verified');
}
console.log('PASS source-verified Cameroon foot profile routing in both cities');
