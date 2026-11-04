import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/supabaseClient.ts','utf8');
const board=readFileSync('dashboard/src/components/commuter/DepartureBoard.tsx','utf8');
const start=api.indexOf("router.get('/mobility/departures',");
const end=api.indexOf('// ── PAYMENT WEBHOOK',start);
assert.ok(start>=0&&end>start);
const route=api.slice(start,end);
for(const token of [
 "req.query.page", "req.query.origin", "req.query.destination", "req.query.date",
 "req.query.max_fare_xaf", "query=query.ilike('origin'",
 "query=query.ilike('destination'", "query=query.gte('departure_time'",
 "query=query.lte('price_per_seat'", ".range(page*50,page*50+50)",
 "const hasMore=(rows||[]).length>50",
 "projectPublishedDepartures({routes:routes||[]",
 "afat_vehicle_compliance_current",
 "search_exhausted:!hasMore",
 "availability_is_provisional:true",
])assert.ok(route.includes(token),'paginated verified search: '+token);
assert.ok(!route.includes(".limit(50)"),'server must page before projection, not silently truncate');
assert.ok(route.includes("new Date(localStart+3_600_000).toISOString().slice(0,10)!==day"),
  'server must reject normalized/nonexistent Cameroon calendar dates');
const validCameroonDay=(day:string)=>{
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day))return false;
  const start=Date.parse(day+'T00:00:00+01:00');
  return Number.isFinite(start)&&new Date(start+3_600_000).toISOString().slice(0,10)===day;
};
for(const day of ['2026-02-28','2028-02-29','2026-11-04'])
  assert.equal(validCameroonDay(day),true,'valid calendar day '+day);
for(const day of ['2026-02-29','2026-02-31','2026-04-31','2026-13-01','2026-00-01','2026-11-31'])
  assert.equal(validCameroonDay(day),false,'reject nonexistent day '+day);
for(const token of [
 "params.set('page'", "params.set('origin'", "params.set('destination'",
 "params.set('date'", "params.set('max_fare_xaf'",
])assert.ok(client.includes(token),'client pagination: '+token);
for(const token of [
 "fetchPublishedDepartures({", "setPage(value=>value+1)",
 "More future departures remain", "feedHealthy&&!hasMore&&originQuery.trim()",
 "data.availability_is_provisional!==true", "data.page!==page",
 "data.success!==true", "!Array.isArray(data.departures)",
 "data.search_exhausted!==!data.has_more", "role=\"alert\"",
 "Retry search", "Search page limit reached",
 "const filtered=feedHealthy?selectRealDepartures(departures,{",
])assert.ok(board.includes(token),'loaded discovery page and honest empty state: '+token);
console.log('PASS AFAT server-filtered page discovery and no false negative demand across unvisited pages');
