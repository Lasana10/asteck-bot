import assert from 'node:assert/strict';
import {assessReportedObservation,isHumanAppObservation,reviewedMapEffects} from '../src/services/mapObservationProvenance';
const now=Date.parse('2026-10-23T21:00:00Z');
const observedAt='2026-10-23T20:59:50Z';
const base={observedAt,accuracy:12,latitude:3.86,longitude:11.51,networkType:'online'};
assert.equal(assessReportedObservation(base,now).ok,true);
for(const actor of ['app_user','voice_transcript_report','verified_incident_report','guest_incident_report','commuter_mission','spoofed_staff']){
 assert.equal(isHumanAppObservation({source:'app',signalType:'incident',incidentType:null,actorType:actor}),true,actor);
}
assert.equal(isHumanAppObservation({source:'app',signalType:'field_observation',incidentType:null,actorType:'commuter_mission'}),true);
assert.equal(isHumanAppObservation({source:'app',signalType:'movement',incidentType:null,actorType:'app_user'}),false);
for(const values of [
 {...base,accuracy:null},{...base,accuracy:999},{...base,accuracy:-1},
 {...base,observedAt:null},{...base,latitude:999},{...base,longitude:undefined},
 {...base,observedAt:'2026-10-22T20:00:00Z'},
 {...base,observedAt:'2026-10-23T21:00:08Z'},
]){
 assert.equal(assessReportedObservation(values,now).ok,false,JSON.stringify(values));
}
assert.equal(assessReportedObservation({...base,networkType:'offline',observedAt:'2026-10-23T11:00:00Z'},now).ok,true);
assert.deepEqual(reviewedMapEffects({isHumanObservation:true,isIncident:true,trustedIncident:false,signalType:'incident'}),{
 contributes_to_live_feed:false,contributes_to_safety_score:false,contributes_to_demand_radar:false,
});
assert.equal(reviewedMapEffects({isHumanObservation:true,isIncident:true,trustedIncident:true,signalType:'incident'}).contributes_to_safety_score,true);
assert.equal(reviewedMapEffects({isHumanObservation:false,isIncident:false,trustedIncident:false,signalType:'movement'}).contributes_to_demand_radar,true);
console.log('PASS AFAT report provenance age, device uncertainty, actor-bypass prevention and review truth');
