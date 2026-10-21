import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fieldEvidencePath, validateFieldObservation } from './fieldMappingQueue';

vi.mock('../supabaseClient',()=>({supabase:{auth:{getUser:vi.fn()}}}));
const base = {
  id:'123e4567-e89b-42d3-a456-426614174000',
  userId:'123e4567-e89b-42d3-a456-426614174001',
  cityKey:'cm-yaounde',type:'entrance',latitude:3.866,longitude:11.516,
  accuracyM:12,observedAt:new Date().toISOString(),photo:null,
};
describe('offline field evidence integrity',()=>{
  beforeEach(()=>vi.useRealTimers());
  it('uses a stable photo path on every retry, not current time or filename',()=>{
    const photo=new File(['abc'],'different-supplied-name.jpg',{type:'image/jpeg'});
    const input={...base,photo};
    expect(fieldEvidencePath(input)).toBe(`${base.userId}/${base.id}.jpg`);
    expect(fieldEvidencePath({...input,photo:new File(['def'],'other.jpg',{type:'image/jpeg'})})).toBe(fieldEvidencePath(input));
  });
  it('rejects coordinate errors and untrustworthy location accuracy',()=>{
    expect(()=>validateFieldObservation({...base,longitude:181})).toThrow();
    expect(()=>validateFieldObservation({...base,accuracyM:500})).toThrow();
    expect(()=>validateFieldObservation({...base,accuracyM:12})).not.toThrow();
  });
  it('links genuine passenger destination evidence only with bounded place identity',()=>{
    expect(()=>validateFieldObservation({...base,placeId:'99f9922d-c06a-4b01-a1a3-487a262e4b6a',placeName:'Helios High Tech Academy'})).not.toThrow();
    expect(()=>validateFieldObservation({...base,placeId:'../../private'})).toThrow();
    expect(()=>validateFieldObservation({...base,placeName:'x'.repeat(181)})).toThrow();
  });
  it('preserves older offline observations and rejects unsupported photo formats',()=>{
    expect(()=>validateFieldObservation({...base,observedAt:new Date(Date.now()-14*86400000).toISOString()})).not.toThrow();
    expect(()=>validateFieldObservation({...base,photo:new File(['x'],'x.svg',{type:'image/svg+xml'})})).toThrow();
  });
});
