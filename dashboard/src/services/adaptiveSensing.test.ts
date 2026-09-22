import {describe,expect,it} from 'vitest';
import {decideSensing} from './adaptiveSensing';

describe('AFAT adaptive sensing',()=>{
  it('backs off while stationary',()=>{
    expect(decideSensing({profile:'balanced',speedKph:0,matched:true}).minimumIntervalMs).toBeGreaterThanOrEqual(20000);
  });
  it('escalates on unknown roads',()=>{
    const d=decideSensing({profile:'balanced',speedKph:25,matched:false});
    expect(d.minimumIntervalMs).toBeLessThanOrEqual(3500);
    expect(d.enableHighAccuracy).toBe(true);
  });
  it('protects low battery',()=>{
    const d=decideSensing({profile:'survey',speedKph:10,matched:true,batteryLevel:.12,charging:false});
    expect(d.minimumIntervalMs).toBeGreaterThanOrEqual(18000);
    expect(d.enableHighAccuracy).toBe(false);
  });
});
