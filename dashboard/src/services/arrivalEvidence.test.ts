import {describe,expect,it} from 'vitest';
import {assessArrivalCandidate,readyForPassengerArrivalConfirmation} from './arrivalEvidence';
const now=1800000000000;
const position=(overrides:Record<string,unknown>={})=>({
 latitude:3.866,longitude:11.516,accuracyM:12,timestampMs:now-8000,
 source:'device_gnss' as const,...overrides
});
const target={latitude:3.866,longitude:11.516};
describe('AFAT real passenger arrival evidence and explicit confirmation',()=>{
 it('requires successive recent accurate distinct GNSS fixes before offering confirmation',()=>{
  const first=assessArrivalCandidate({fix:position(),target,previous:null,routeReady:true,nowMs:now});
  expect(first?.observations).toBe(1);
  expect(readyForPassengerArrivalConfirmation(first)).toBe(false);
  const next=assessArrivalCandidate({fix:position({timestampMs:now-4000}),target,previous:first,routeReady:true,nowMs:now});
  expect(next?.observations).toBe(2);
  expect(readyForPassengerArrivalConfirmation(next)).toBe(true);
 });
 it('cannot confirm uncertain, stale, untrusted, distant or routing-unavailable evidence',()=>{
  for(const fix of [position({accuracyM:26}),position({timestampMs:now-30000}),
    position({source:'field_observation'}),position({latitude:3.868}),
    position({timestampMs:now+10000})]){
   expect(assessArrivalCandidate({fix,target,previous:null,routeReady:true,nowMs:now})).toBeNull();
  }
  expect(assessArrivalCandidate({fix:position(),target,previous:null,routeReady:false,nowMs:now})).toBeNull();
 });
 it('resets evidence on destination switch, duplicate timestamps and long gaps',()=>{
  const first=assessArrivalCandidate({fix:position(),target,previous:null,routeReady:true,nowMs:now})!;
  const same=assessArrivalCandidate({fix:position(),target,previous:first,routeReady:true,nowMs:now});
  expect(same?.observations).toBe(1);
  const changed=assessArrivalCandidate({fix:position({timestampMs:now-4000}),target:{latitude:3.8661,longitude:11.516},previous:first,routeReady:true,nowMs:now});
  expect(changed?.observations).toBe(1);
  const delayed=assessArrivalCandidate({fix:position({timestampMs:now-100}),target,previous:first,routeReady:true,nowMs:now});
  expect(delayed?.observations).toBe(1);
 });
});
