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
 "feedHealthy&&!hasMore&&originQuery.trim()",
])assert.ok(board.includes(token),'loaded discovery page and honest empty state: '+token);
console.log('PASS AFAT server-filtered page discovery and no false negative demand across unvisited pages');
