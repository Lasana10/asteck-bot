import assert from 'node:assert/strict';
// Read-only live acceptance of actual AFAT passenger place-to-destination API.
const origin=new URL(process.env.AFAT_BACKEND_URL||'https://asteck-bot.onrender.com');
assert.equal(origin.protocol,'https:');
async function read(route,init={}){
 const res=await fetch(new URL(route,origin),{...init,headers:{accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(25000)});
 const body=await res.text();
 assert.equal(res.status,200,'AFAT '+route+' HTTP '+res.status+' '+body.slice(0,200));
 return JSON.parse(body);
}
async function discover(q){return read('/api/place/discover?'+new URLSearchParams({q,city:'yaounde',limit:'10'}));}
const [exact,typo]=await Promise.all([discover('Mendong'),discover('Mendnog')]);
assert.equal(exact.matching_engine,'fuzzy_atlas');
assert.equal(typo.matching_engine,'fuzzy_atlas');
assert.ok(Array.isArray(exact.results)&&Array.isArray(typo.results));
const locality=exact.results.find(x=>x.name==='Mendong');
assert.ok(locality?.id,'Mendong was not discovered');
const recovered=typo.results.find(x=>x.id===locality.id);
assert.ok(recovered,'AFAT lost database-supported typo match');
assert.equal(recovered.match_reason,'fuzzy_name');
assert.equal(recovered.source_only,true,'AFAT promoted source-only place');
assert.notEqual(recovered.place_status,'verified');
assert.ok(recovered.explanation.some(x=>x.includes('Approximate spelling match')));
const answer=await read('/api/place/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'Mendnog',city:'yaounde',vehicle_type:'car'})});
assert.ok(Array.isArray(answer.candidates));
const destination=answer.candidates.find(x=>x.id===locality.id);
assert.ok(destination,'Recovered place not available for navigation destination resolution');
assert.equal(destination.source_only,true);
assert.ok(destination.explanation.some(x=>x.includes('Approximate spelling match')));
console.log('PASS actual AFAT passenger discovery and resolution of a misspelt, source-only real Cameroon place; no data mutation.');
