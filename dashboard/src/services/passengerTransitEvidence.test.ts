import {describe,it,expect} from 'vitest';
import {preparePassengerTransitObservation,type PassengerTransitDraft} from './passengerTransitEvidence';
const now=1800000000000,fix={latitude:3.866,longitude:11.516,accuracyM:18,timestampMs:now-2000,source:'field_observation' as const};
const draft:PassengerTransitDraft={cityKey:'cm-yaounde',observationType:'stop',
 nodeName:'Carrefour Mendong',lineName:'Biyem-Assi corridor',directionLabel:'Toward Poste Centrale',mode:'minibus',notes:'Marked stop observed'};
describe('AFAT real passenger transit discovery → review evidence contract',()=>{
 it('only creates reviewable non-active stop observations from real fresh GPS',()=>{
  const result=preparePassengerTransitObservation(draft,fix,now);
  expect(result.ok).toBe(true);
  if(!result.ok)return;
  expect(result.input).toMatchObject({cityKey:'cm-yaounde',observationType:'stop',mode:'minibus',gpsAccuracyM:18,
   latitude:3.866,longitude:11.516,nodeName:'Carrefour Mendong',
   evidence:{source:'passenger_opt_in_field_observation',automatic_truth:false,field_verified:false,active_service:false}});
  expect(result.input.observedAt).toBe(new Date(fix.timestampMs).toISOString());
 });
 it('refuses guessed/old/poor GNSS, unknown city and blank stop names',()=>{
  for(const stale of [null,{...fix,accuracyM:100},{...fix,timestampMs:now-130000},
    {...fix,source:'device_gnss' as const},{...fix,longitude:999},{...fix,timestampMs:now+5000}]){
    expect(preparePassengerTransitObservation(draft,stale,now).ok).toBe(false);
  }
  expect(preparePassengerTransitObservation({...draft,nodeName:' '},fix,now).ok).toBe(false);
  expect(preparePassengerTransitObservation(draft,{...fix,longitude:9.704},now).ok).toBe(false);
  expect(preparePassengerTransitObservation({...draft,cityKey:'cm-douala'},fix,now).ok).toBe(false);
  expect(preparePassengerTransitObservation({...draft,cityKey:'unknown'},fix,now).ok).toBe(false);
 });
});
