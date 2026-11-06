import {describe,it,expect} from 'vitest';
import {resolveAfatMappedCity} from './mapCityResolution';

describe('AFAT map bootstrap city selection',()=>{
 it('resolves approved map viewports with French accents and country qualifiers',()=>{
  expect(resolveAfatMappedCity('Yaoundé')?.cityKey).toBe('cm-yaounde');
  expect(resolveAfatMappedCity('YAOUNDE, Cameroon')?.center).toEqual([11.514,3.866]);
  expect(resolveAfatMappedCity('cm-douala')?.cityKey).toBe('cm-douala');
  expect(resolveAfatMappedCity('Douala, Littoral')?.center).toEqual([9.7043,4.0511]);
 });
 it('never silently maps unknown African cities to Yaoundé',()=>{
  for(const city of ['Bamenda','Bafoussam','Garoua','Lagos','Abidjan','Nairobi','Doualaville','',null,undefined]){
   expect(resolveAfatMappedCity(city)).toBeNull();
  }
 });
});
