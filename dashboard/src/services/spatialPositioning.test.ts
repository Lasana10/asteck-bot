import { describe, expect, it } from 'vitest';
import { evaluateSpatialFix, evaluateCurrentFieldGpsPosition } from './spatialPositioning';
const now = 1800000000000;
const sample = { latitude: 3.866, longitude: 11.516, accuracyM: 16, timestampMs: now - 2000, source: 'device_gnss' };
describe('Atlas spatial positioning evidence', () => {
  it('accepts credible GNSS without claiming visual localization', () => {
    expect(evaluateSpatialFix(sample, null, now)).toMatchObject({ accepted: true, confidence: 'medium', uncertaintyRadiusM: 16 });
  });
  it('rejects stale, unmeasured and low-quality location evidence', () => {
    expect(evaluateSpatialFix({ ...sample, timestampMs: now - 180000 }, null, now).reason).toBe('stale');
    expect(evaluateSpatialFix({ ...sample, accuracyM: undefined }, null, now).reason).toBe('uncertain');
    expect(evaluateSpatialFix({ ...sample, accuracyM: 800 }, null, now).reason).toBe('uncertain');
  });
  it('rejects spoof-like teleportation and chronologically reversed samples', () => {
    const previous = { ...sample, timestampMs: now - 5000 };
    expect(evaluateSpatialFix({ ...sample, latitude: 4.8, timestampMs: now - 2000 }, previous, now).reason).toBe('implausible_motion');
    expect(evaluateSpatialFix({ ...sample, timestampMs: now - 6000 }, previous, now).reason).toBe('out_of_order');
  });
  it('rejects invalid coordinates and future timestamps', () => {
    expect(evaluateSpatialFix({ ...sample, longitude: 200 }, null, now).reason).toBe('invalid_coordinate');
    expect(evaluateSpatialFix({ ...sample, timestampMs: now + 30000 }, null, now).reason).toBe('missing_timestamp');
  });
  it('requires a newly captured field fix when delayed community evidence is submitted',()=>{
    const captured={...sample,source:'field_observation' as const};
    expect(evaluateSpatialFix(captured,null,now).accepted).toBe(true);
    expect(evaluateSpatialFix(captured,null,now+120_001).reason).toBe('stale');
    expect(evaluateSpatialFix({...captured,timestampMs:now+15_000},null,now).accepted).toBe(false);
    expect(evaluateSpatialFix({...captured,accuracyM:180},null,now).reason).toBe('uncertain');
    const observedAt=new Date(captured.timestampMs).toISOString();
    expect(Date.parse(observedAt)).toBe(captured.timestampMs);
  });
  it('accounts for GNSS uncertainty before rejecting a jump', () => {
    const previous = { ...sample, timestampMs: now - 7000, accuracyM: 100 };
    expect(evaluateSpatialFix({ ...sample, longitude: 11.517, timestampMs: now - 2000, accuracyM: 100 }, previous, now).accepted).toBe(true);
  });
});

describe('legacy field contribution custody',()=>{
 const coords={latitude:3.866,longitude:11.516,accuracy:15} as GeolocationCoordinates;
 it('accepts real recent device observations without certifying a road',()=>{
  expect(evaluateCurrentFieldGpsPosition({coords,timestamp:now-1_000},now)).toMatchObject({accepted:true,confidence:'medium'});
 });
 it('rejects stale, inaccurate and malformed field evidence',()=>{
  expect(evaluateCurrentFieldGpsPosition({coords,timestamp:now-35_000},now).reason).toBe('stale');
  expect(evaluateCurrentFieldGpsPosition({coords:{...coords,accuracy:280},timestamp:now-1_000},now).accepted).toBe(false);
  expect(evaluateCurrentFieldGpsPosition({coords:{...coords,latitude:Infinity},timestamp:now-1_000},now).accepted).toBe(false);
 });
});
