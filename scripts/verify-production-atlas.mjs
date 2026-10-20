#!/usr/bin/env node
// Live read-only API contract checks on a network-capable runner.
// No authentication secrets, no synthetic database rows, no paid inference.
import assert from 'node:assert/strict';

const base=String(process.env.AFAT_API_URL||'https://asteck-bot.onrender.com').replace(/\/+$/,'');
const api=new URL(base);
assert.equal(api.protocol,'https:','Production probe requires HTTPS');

async function fetchJson(path,options={}) {
  const r=await fetch(new URL(path,api),{
    ...options,
    headers:{accept:'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(25000),
  });
  const data=await r.json().catch(()=>null);
  return {status:r.status,data};
}
async function healthProbe(){
  for(let i=0;i<4;i++){
    try {
      const response=await fetchJson('/health');
      if(response.status===200&&response.data?.status==='UP'&&response.data?.service==='AFAT')return response.data;
    }catch(err){if(i===3)throw err;}
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  throw Error('Live AFAT service did not pass its health contract.');
}
const health=await healthProbe();
console.log('AFAT backend live build:',String(health.build||'unknown').slice(0,50));
const contract=await fetchJson('/health/contract');
assert.equal(contract.status,200,'deployed contract endpoint failed');
assert.equal(contract.data?.status,'contract_ready','deployed API contract missing');
for(const route of ['POST /api/atlas/explain','GET /api/atlas/nearby','POST /api/atlas/observations']){
  assert.ok(contract.data?.required_routes?.includes(route),`Missing mounted ${route}`);
}
for(const [path,payload] of [
  ['/api/atlas/explain',{latitude:3.866,longitude:11.516,question:'overview'}],
  ['/api/atlas/observations',{atlas_node_id:'00000000-0000-0000-0000-000000000000',observation_type:'safety',idempotency_key:'test-only-no-write'}],
]){
  const result=await fetchJson(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(result.status,401,`Anonymous request incorrectly reached protected ${path}`);
  console.log('Protected',path,'→ HTTP',result.status);
}
const nearby=await fetchJson('/api/atlas/nearby?lat=3.866&lon=11.516&radius_m=1500&limit=40');
assert.equal(nearby.status,200,'Real production public Atlas nearby API unavailable');
assert.ok(Array.isArray(nearby.data?.nodes),'Atlas response missing nodes');
assert.ok(Array.isArray(nearby.data?.edges),'Atlas response missing edges');
for(const item of [...nearby.data.nodes,...nearby.data.edges]){
  assert.ok(['provisional','corroborated','verified'].includes(String(item.evidence_status||'').toLowerCase()),
   'Atlas nearby exposed a non-contract evidence status');
}
console.log('Read-only Atlas response:',nearby.data.nodes.length,'nodes,',nearby.data.edges.length,'edges; reviewed counts are not inferred');
console.log('PASS live AFAT Atlas contract, anonymous write protection, and real nearby response');
