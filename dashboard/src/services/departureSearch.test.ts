import {describe,expect,it} from 'vitest';
import {selectRealDepartures} from './departureSearch';
const now=Date.parse('2026-11-04T09:00:00Z');
const base={id:'a',origin:'Yaoundé',destination:'Douala',departure_time:'2026-11-05T06:00:00Z',
 price_xaf:4000,total_seats:14,booked_seats:5,available_seats:9,vehicle_type:'minibus'};
const constraints={origin:'',destination:'',date:'',maximumFareXaf:'',minimumSeats:1,vehicleType:'all',query:''};
describe('real departure search constraints',()=>{
 it('matches Cameroon cities, budget, date and seats',()=>{
  const records=[base,{...base,id:'b',origin:'Bafoussam',price_xaf:3000},
   {...base,id:'c',price_xaf:6000},{...base,id:'d',available_seats:1}];
  expect(selectRealDepartures(records,{...constraints,origin:'yaounde',destination:'dou',
   date:'2026-11-05',maximumFareXaf:'4500',minimumSeats:2},now).map(x=>x.id)).toEqual(['a']);
 });
 it('compares calendar dates in Africa/Douala, not device timezone',()=>{
  const item={...base,departure_time:'2026-11-04T23:30:00Z'};
  expect(selectRealDepartures([item],{...constraints,date:'2026-11-05'},now)).toHaveLength(1);
  expect(selectRealDepartures([item],{...constraints,date:'2026-11-04'},now)).toHaveLength(0);
 });
 it('excludes old, sold-out and invalidly priced services, preserving ordered future results',()=>{
  const old={...base,id:'old',departure_time:'2026-11-03T06:00:00Z'};
  const sold={...base,id:'sold',available_seats:0};
  const bad={...base,id:'bad',price_xaf:0};
  const later={...base,id:'later',departure_time:'2026-11-05T08:00:00Z'};
  expect(selectRealDepartures([old,sold,bad,later,base],constraints,now).map(x=>x.id)).toEqual(['a','later']);
 });
 it('rejects unusable max-fare values',()=>{
  expect(selectRealDepartures([base],{...constraints,maximumFareXaf:'0'},now)).toHaveLength(0);
  expect(selectRealDepartures([base],{...constraints,maximumFareXaf:'invalid'},now)).toHaveLength(0);
 });
});