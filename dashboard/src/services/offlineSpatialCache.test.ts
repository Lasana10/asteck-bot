import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cacheSpatialViewport,searchCachedPlaces} from './offlineSpatialCache';
beforeEach(()=>{
 const items=new Map<string,string>();
 vi.stubGlobal('localStorage',{
  getItem:(k:string)=>items.get(k)??null,setItem:(k:string,v:string)=>{items.set(k,v);},
  removeItem:(k:string)=>items.delete(k),clear:()=>items.clear(),
 });
});
describe('offline passenger Find knowledge boundaries',()=>{
 it('finds real cached names only inside the selected city and never invents coordinates',()=>{
  cacheSpatialViewport({cityKey:'cm-yaounde',west:11.4,east:11.6,south:3.7,north:4,places:[
   {id:'market-1',name:'Central market',latitude:3.86,longitude:11.51,evidence_status:'limited',source_key:'openstreetmap'},
  ]});
  expect(searchCachedPlaces('cm-yaounde','market').map(x=>x.id)).toEqual(['market-1']);
  expect(searchCachedPlaces('cm-douala','market')).toEqual([]);
  expect(searchCachedPlaces('cm-yaounde','unknown')).toEqual([]);
 });
 it('refuses stale geographic candidates when older than seven days',()=>{
  cacheSpatialViewport({cityKey:'cm-yaounde',west:11.4,east:11.6,south:3.7,north:4,places:[
   {id:'old',name:'Historic school',latitude:3.86,longitude:11.51},
  ]});
  const key='afat_offline_spatial_v1';
  const item=JSON.parse(localStorage.getItem(key)!);
  item.viewports[0].capturedAt=new Date(Date.now()-8*86400_000).toISOString();
  localStorage.setItem(key,JSON.stringify(item));
  expect(searchCachedPlaces('cm-yaounde','historic')).toEqual([]);
 });
});
