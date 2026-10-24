import assert from 'node:assert/strict';
import {validatedValhallaBase,valhallaPayload,parseValhallaResponse} from '../src/services/valhallaRouting';

assert.equal(validatedValhallaBase('http://router.project-osrm.org'),null);
assert.equal(validatedValhallaBase('http://valhalla-private-b47x',false),null);
assert.equal(validatedValhallaBase('http://valhalla-private-b47x',true),'http://valhalla-private-b47x');
assert.equal(validatedValhallaBase('https://example.com/route'),null);
assert.equal(validatedValhallaBase('https://user:secret@example.com'),null);
const a={latitude:3.866,longitude:11.516},b={latitude:3.868,longitude:11.519};
const payload=valhallaPayload(a,b,'bicycle');
assert.equal(payload.costing,'bicycle');
assert.equal(payload.shape_format,'geojson');
assert.deepEqual(payload.locations,[{lat:3.866,lon:11.516},{lat:3.868,lon:11.519}]);
const response={trip:{summary:{length:0.7,time:183},legs:[{
 shape:{type:'LineString',coordinates:[[11.516,3.866],[11.517,3.867],[11.519,3.868]]},
 maneuvers:[{begin_shape_index:0,instruction:'Continue',length:0.3,type:1},
  {begin_shape_index:2,instruction:'Arrive',length:0,type:15}],
}]}};
const real=parseValhallaResponse(response);
assert.ok(real);
assert.equal(real.source,'valhalla');
assert.equal(real.primary.distanceMeters,700);
assert.equal(real.primary.maneuvers?.length,2);
assert.equal(real.primary.geometry?.coordinates.length,3);
assert.equal(parseValhallaResponse({trip:{...response.trip,legs:[{...response.trip.legs[0],shape:{type:'LineString',coordinates:[[11.516,3.866],[400,3.866]]}}]}}),null);
assert.equal(parseValhallaResponse({trip:{...response.trip,summary:{length:0,time:0}}}),null);
assert.equal(parseValhallaResponse({trip:{...response.trip,legs:[]}}),null);
console.log('PASS opt-in Valhalla bicycle/motorcycle mapping, strict host allowlist, real geometry and fail-closed routing');
