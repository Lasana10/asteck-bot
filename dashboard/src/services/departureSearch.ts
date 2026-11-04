/** Passenger-side filtering of server-verified scheduled departures.
 * Search only filters provider-issued records; it cannot create inventory.
 */
export type SearchableDeparture={
 id:string;origin:string;destination:string;departure_time:string;
 price_xaf:number;total_seats:number;booked_seats:number;
 available_seats?:number;vehicle_type:string;
};
export type DepartureSearchConstraints={
 origin:string;destination:string;date:string;maximumFareXaf:string;
 minimumSeats:number;vehicleType:string;query:string;
};
const clean=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function selectRealDepartures<T extends SearchableDeparture>(
 items:T[],constraints:DepartureSearchConstraints,nowMs=Date.now(),
):T[]{
 const from=clean(constraints.origin),to=clean(constraints.destination),
  q=clean(constraints.query);
 const maxFare=constraints.maximumFareXaf.trim()?Number(constraints.maximumFareXaf):null;
 const seats=Math.max(1,Math.min(50,Math.floor(constraints.minimumSeats)||1));
 return items.filter(item=>{
   const time=Date.parse(item.departure_time);
   const available=item.available_seats??item.total_seats-item.booked_seats;
   const dateParts=Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Douala',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)):[];
   const part=(type:string)=>dateParts.find(p=>p.type===type)?.value||'';
   const localDate=dateParts.length?`${part('year')}-${part('month')}-${part('day')}`:'';
   return Number.isFinite(time)&&time>nowMs&&
     Number.isSafeInteger(available)&&available>=seats&&
     Number.isSafeInteger(item.price_xaf)&&item.price_xaf>0&&
     (!from||clean(item.origin).includes(from))&&
     (!to||clean(item.destination).includes(to))&&
     (!q||clean(item.origin).includes(q)||clean(item.destination).includes(q))&&
     (!constraints.date||localDate===constraints.date)&&
     (maxFare===null||(Number.isFinite(maxFare)&&maxFare>0&&item.price_xaf<=maxFare))&&
     (constraints.vehicleType==='all'||item.vehicle_type===constraints.vehicleType);
 }).sort((a,b)=>Date.parse(a.departure_time)-Date.parse(b.departure_time)||
   a.price_xaf-b.price_xaf||a.id.localeCompare(b.id));
}
