import assert from 'node:assert/strict';
import { claimableNearbyRequests, PICKUP_RADIUS_M } from '../src/services/dispatchPickupEligibility';

const fleet = [
  { id:'car',type:'taxi',current_lat:3.848,current_lng:11.502 },
  { id:'moto',type:'moto',current_lat:3.848,current_lng:11.502 },
];
const requests = [
  { id:'near-car',requested_vehicle_type:'car',origin_lat:3.849,origin_lng:11.503 },
  { id:'near-moto',requested_vehicle_type:'moto',origin_lat:3.849,origin_lng:11.503 },
  { id:'far-car',requested_vehicle_type:'car',origin_lat:3.848,origin_lng:12.502 },
  { id:'unknown',requested_vehicle_type:null,origin_lat:3.848,origin_lng:11.502 },
  { id:'missing-pickup',requested_vehicle_type:'car',origin_lat:null,origin_lng:null },
  { id:'wrong-mode',requested_vehicle_type:'minibus',origin_lat:3.848,origin_lng:11.502 },
];

assert.equal(PICKUP_RADIUS_M,7000);
assert.deepEqual(claimableNearbyRequests(requests,fleet).map((request)=>request.id),['near-car','near-moto']);
assert.deepEqual(claimableNearbyRequests(requests,[fleet[0]]).map((request)=>request.id),['near-car']);
assert.deepEqual(claimableNearbyRequests(requests,[]),[]);
console.log('Nearby operator request queue verification passed.');
