/**
 * A published departure is operator-authored inventory, not verified road
 * passability or a source-confirmed building entrance.
 */
export type ScheduleDraft={
 vehicle_id:string; origin:string;destination:string;
 origin_lat:number;origin_lng:number;dest_lat:number;dest_lng:number;
 departure_time:string;price_per_seat:number;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean=(v:unknown)=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,120):'';
export function validateScheduleDraft(raw:unknown,now=Date.now()):ScheduleDraft{
 const d=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 const vehicle_id=clean(d.vehicle_id),origin=clean(d.origin),destination=clean(d.destination);
 if(!uuid.test(vehicle_id)||origin.length<3||destination.length<3)throw Error('REAL_VEHICLE_AND_ENDPOINTS_REQUIRED');
 const coords=['origin_lat','origin_lng','dest_lat','dest_lng'] as const;
 for(const name of coords){
  const value=d[name];
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>(name.endsWith('lat')?90:180))
   throw Error('REAL_GEOGRAPHIC_COORDINATES_REQUIRED');
 }
 const distanceLat=Math.abs((d.origin_lat as number)-(d.dest_lat as number));
 const distanceLng=Math.abs((d.origin_lng as number)-(d.dest_lng as number));
 if(distanceLat<0.0001&&distanceLng<0.0001)throw Error('DISTINCT_DESTINATION_REQUIRED');
 const date=typeof d.departure_time==='string'?Date.parse(d.departure_time):NaN;
 if(!Number.isFinite(date)||date<now+10*60_000||date>now+30*24*60*60_000)
  throw Error('FUTURE_DEPARTURE_10_MINUTES_TO_30_DAYS_REQUIRED');
 const price=d.price_per_seat;
 if(typeof price!=='number'||!Number.isSafeInteger(price)||price<1||price>2_000_000)
  throw Error('VALID_XAF_FARE_REQUIRED');
 return {vehicle_id,origin,destination,origin_lat:d.origin_lat as number,
  origin_lng:d.origin_lng as number,dest_lat:d.dest_lat as number,dest_lng:d.dest_lng as number,
  departure_time:new Date(date).toISOString(),price_per_seat:price};
}
