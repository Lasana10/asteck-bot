/** Fail-closed extraction of active seat claims for the passenger departure board.
 * Supabase Data API can cap query result rows independently of our request;
 * silently accepting a truncated bookings page would oversell seats.
 */
export const ACTIVE_DEPARTURE_BOOKING_STATES=['pending','accepted','confirmed','boarded','in_progress'] as const;
export type ActiveDepartureSeatClaim={
 id:string;route_id:string;seat_label:string|null;status:string;
};
type QueryClient={from:(name:string)=>any};
export async function loadActiveDepartureSeatClaims(
 client:QueryClient, routeIds:string[], options:{pageSize?:number;maximumPages?:number}={},
):Promise<ActiveDepartureSeatClaim[]>{
 if(!routeIds.length)return [];
 const pageSize=options.pageSize??1000,maximumPages=options.maximumPages??12;
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000||
   !Number.isSafeInteger(maximumPages)||maximumPages<1||maximumPages>20)
  throw Error('INVALID_DEPARTURE_INVENTORY_PAGINATION');
 const all:ActiveDepartureSeatClaim[]=[];
 let lastId:string|null=null;
 for(let page=0;page<maximumPages;page++){
  // Cursor pagination remains consistent across pages even when earlier
  // rows change. A disappearing or malformed page fails closed.
  let query=client.from('bookings')
    .select('id,route_id,seat_label,status')
    .in('route_id',routeIds).in('status',[...ACTIVE_DEPARTURE_BOOKING_STATES])
    .order('id',{ascending:true}).limit(pageSize);
  if(lastId)query=query.gt('id',lastId);
  const {data,error}=await query;
  if(error||!Array.isArray(data))throw Error('DEPARTURE_BOOKING_INVENTORY_UNAVAILABLE');
  if(data.length>pageSize)throw Error('DEPARTURE_BOOKING_PAGE_OVERFLOW');
  for(const row of data){
   if(typeof row?.id!=='string'||!row.id||
      typeof row.route_id!=='string'||!routeIds.includes(row.route_id)||
      !ACTIVE_DEPARTURE_BOOKING_STATES.includes(row.status)||
      (lastId!=null&&row.id<=lastId))
    throw Error('DEPARTURE_BOOKING_INVENTORY_UNTRUSTED');
   lastId=row.id;
   all.push(row as ActiveDepartureSeatClaim);
  }
  if(data.length<pageSize)return all;
 }
 throw Error('DEPARTURE_BOOKING_INVENTORY_EXCEEDS_SAFE_PAGINATION');
}
