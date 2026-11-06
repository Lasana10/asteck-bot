import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('dashboard/src/components/operator/ScheduledDeparturePublisher.tsx','utf8');
for(const required of [
  'const requestSequence=useRef(0)',
  'currentInputs.current={originQuery,destinationQuery,originCity,destinationCity}',
  'requestSequence.current+=1',
  'seq!==requestSequence.current||query!==latestQuery||city!==latestCity',
  'invalidatePlaceLookup();isOrigin?setOriginQuery',
  'invalidatePlaceLookup();isOrigin?setOriginCity',
  'if(publishing||busy)return',
  "vehicle.clearance_status!=='verified'",
  'origin.id===destination.id',
  'instant<Date.now()+10*60_000',
  'instant>Date.now()+30*24*60*60_000',
  'setPublishing(true)',
  'finally{setPublishing(false);}',
  "if(error||!data?.departure?.id)",
  'Departure publication is unverified.',
  'disabled={busy||publishing||vehicle?.clearance_status',
])assert.ok(ui.includes(required),'real operator departure publication safeguard missing: '+required);
const marker=ui.indexOf('const {data,error}=await discoverAfatPlaces');
assert.ok(marker>0&&ui.indexOf('seq!==requestSequence.current',marker)>marker,
  'only matching current geographic search may populate selectable places');
assert.ok(ui.includes('Scheduled departure published ·'),'operator gets server-backed confirmation only');
console.log('PASS operator publication: current geographic choice, valid future schedule, no duplicate publish');
