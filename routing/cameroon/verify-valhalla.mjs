import assert from 'node:assert/strict';
import {parseValhallaResponse,valhallaPayload} from '../../src/services/valhallaRouting';
const base=process.env.AFAT_VALHALLA_SMOKE_BASE||'http://127.0.0.1:8002';
const url=new URL(base);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)||process.env.AFAT_VALHALLA_AUTHORIZED_SMOKE==='true');
async function run(city,mode,a,b){
 const res=await fetch(new URL('/route',url),{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(valhallaPayload(a,b,mode)),signal:AbortSignal.timeout(45000)});
 const data=await res.json();
 assert.equal(res.status,200,city+' '+mode+' routing HTTP '+res.status+' '+JSON.stringify(data).slice(0,240));
 const route=parseValhallaResponse(data);
 assert.ok(route,city+' '+mode+' invalid/missing real route geometry');
 assert.ok(Number(route.primary.distanceMeters)>0);
 assert.ok(route.primary.durationValue>0);
 console.log(city+' '+mode+': '+Math.round(Number(route.primary.distanceMeters))+' metres, '+
  Math.round(route.primary.durationValue)+' seconds, '+route.primary.geometry?.coordinates.length+
  ' mapped points. Road legality, field passability and passenger safety NOT verified.');
}
await run('Yaoundé','bicycle',{latitude:3.8669,longitude:11.5168},{latitude:3.884,longitude:11.505});
await run('Yaoundé','motorcycle',{latitude:3.8669,longitude:11.5168},{latitude:3.884,longitude:11.505});
await run('Douala','bicycle',{latitude:4.0511,longitude:9.7679},{latitude:4.061,longitude:9.735});
await run('Douala','motorcycle',{latitude:4.0511,longitude:9.7679},{latitude:4.061,longitude:9.735});
console.log('PASS real Cameroon Valhalla routing smoke; read only; no invented journeys');
