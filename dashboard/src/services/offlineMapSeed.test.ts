import {describe,it,expect} from 'vitest';
import {validateOfflineYaoundeSeed} from './offlineMapSeed';

const roads={type:'FeatureCollection',features:[{type:'Feature',
 properties:{name:'A sample street',congestion:'critical',verified:true},
 geometry:{type:'LineString',coordinates:[[11.50,3.86],[11.51,3.87]]}}]};
const places={type:'FeatureCollection',features:[{type:'Feature',
 properties:{name:'A sample place',is_open:true,live_vehicle_count:100},
 geometry:{type:'Point',coordinates:[11.52,3.86]}}]};
describe('AFAT offline source-only passenger map geometry',()=>{
 it('renders valid local source geometry without inventing traffic or reviewed routing',()=>{
   const result=validateOfflineYaoundeSeed(roads,places);
   expect(result?.roads.features).toHaveLength(1);
   expect(result?.places.features).toHaveLength(1);
   expect(result?.roads.features[0].properties).toEqual({
     name:'A sample street',source_only:true,review_status:'seed_unverified',kind:'road_seed',
   });
   expect(result?.places.features[0].properties).toEqual({
     name:'A sample place',source_only:true,review_status:'seed_unverified',kind:'place_seed',
   });
 });
 it('does not accept other cities or malformed geometry under the Yaoundé seed',()=>{
   expect(validateOfflineYaoundeSeed({...roads,features:[{...roads.features[0],
     geometry:{type:'LineString',coordinates:[[9.7,4.05],[9.71,4.06]]}}]},places)).toBeNull();
   expect(validateOfflineYaoundeSeed(roads,{...places,features:[{...places.features[0],
     geometry:{type:'Point',coordinates:[NaN,3.85]}}]})).toBeNull();
   expect(validateOfflineYaoundeSeed({...roads,features:[]},places)).toBeNull();
 });
 it('does not accept overly large or non-GeoJSON payloads',()=>{
   expect(validateOfflineYaoundeSeed({...roads,features:new Array(4001).fill(roads.features[0])},places)).toBeNull();
   expect(validateOfflineYaoundeSeed({type:'FeatureCollection',features:'oops'},places)).toBeNull();
 });
});
