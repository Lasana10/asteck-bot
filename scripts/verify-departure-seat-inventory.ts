import assert from 'node:assert/strict';
import {loadActiveDepartureSeatClaims} from '../src/services/departureSeatInventory';
import {projectPublishedDepartures} from '../src/services/publishedDepartureTruth';

function mockClient(records:any[],options:{errorOnPage?:number;truncate?:boolean}={}){
 let calls=0;
 return {from(table:string){
   assert.equal(table,'bookings');
   calls++;
   let cursor:string|null=null,limit=1000;
   const chain:any={
     select(columns:string){
       assert.equal(columns,'id,route_id,seat_label,status');return chain;
     },
     in(_column:string,_values:string[]){return chain;},
     order(column:string){assert.equal(column,'id');return chain;},
     limit(size:number){limit=size;return chain;},
     gt(column:string,value:string){assert.equal(column,'id');cursor=value;return chain;},
     then(resolve:any,reject:any){
       const data=records.filter(r=>!cursor||r.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);
       return Promise.resolve(options.errorOnPage===calls?
         {data:null,error:{message:'Data API failure'}}:{data,error:null}).then(resolve,reject);
     },
   };
   return chain;
  }};
}
async function main(){
const rows=[
 {id:'001',route_id:'route-1',status:'confirmed',seat_label:'1'},
 {id:'002',route_id:'route-1',status:'cancelled',seat_label:'2'},
 {id:'003',route_id:'route-1',status:'accepted',seat_label:'03'},
 {id:'004',route_id:'route-1',status:'pending',seat_label:'3'},
 {id:'005',route_id:'route-1',status:'confirmed',seat_label:'4'},
].filter(r=>r.status!=='cancelled');
const loaded=await loadActiveDepartureSeatClaims(mockClient(rows),['route-1'],{pageSize:2});
assert.equal(loaded.length,4,'all cursor pages returned');
const now=Date.parse('2026-11-06T12:00:00Z');
const projected=projectPublishedDepartures({
 routes:[{id:'route-1',is_active:true,operator_id:'operator',vehicle_id:'vehicle',name:'Mokolo to Mvan',
  origin:'Mokolo',destination:'Mvan',departure_time:'2026-11-06T16:00:00Z',price_per_seat:1500,capacity:5}],
 bookings:loaded,operators:[{id:'operator',verification_status:'verified',operator_application_status:'APPROVED'}],
 vehicles:[{id:'vehicle',capacity:5,clearance_status:'verified'}],nowMs:now,
});
assert.equal(projected.length,1);
assert.deepEqual(projected[0].occupied_seats,['1','3','4']);
assert.equal(projected[0].available_seats,2);
await assert.rejects(loadActiveDepartureSeatClaims(mockClient(rows,{errorOnPage:2}),['route-1'],{pageSize:2}),/UNAVAILABLE/);
await assert.rejects(loadActiveDepartureSeatClaims(mockClient(rows),['route-1'],{pageSize:2,maximumPages:2}),/EXCEEDS_SAFE_PAGINATION/);
assert.deepEqual(await loadActiveDepartureSeatClaims(mockClient(rows),[]),[]);
console.log('PASS multi-page active booking inventory → canonical seat projection; query failures fail closed');

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
