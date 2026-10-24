import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const planner=readFileSync(new URL('../components/commuter/PassagePlanner.tsx',import.meta.url),'utf8');
describe('AFAT passenger integrated Valhalla micromobility release boundary',()=>{
 it('requests bike routes, labels evidence, offers a non-bookable bicycle journey',()=>{
  expect(planner).toContain("['walk', 'bike', 'moto', 'car', 'minibus']");
  expect(planner).toContain("['bike', Bike, 'Cycle']");
  expect(planner).toContain("route.route_source === 'valhalla'");
  expect(planner).toContain("mode !== 'walk' && mode !== 'bike'");
  expect(planner).toContain("vehicleType === 'walk' || vehicleType === 'bike'");
 });
});
