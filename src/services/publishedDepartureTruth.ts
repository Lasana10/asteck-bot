/**
 * Passenger-facing public departure projection.
 * Published supply must correspond to a genuinely approved operator/vehicle,
 * a future departure, positive published fare and seats not already booked.
 * Holds are enforced during booking by the existing transactional RPC; this
 * discovery view is informational and never reserves inventory.
 */
export function projectPublishedDepartures(input:{
  routes:any[]; bookings:any[];operators:any[];vehicles:any[];nowMs:number;
}){
 const operators=new Map(input.operators.map(o=>[o.id,o]));
 const vehicles=new Map(input.vehicles.map(v=>[v.id,v]));
 const booked=new Map<string,Set<string>>();
 for(const b of input.bookings){
  if(typeof b?.route_id!=='string'||typeof b?.seat_label!=='string'||!b.seat_label.trim())continue;
  if(!booked.has(b.route_id))booked.set(b.route_id,new Set());
  booked.get(b.route_id)!.add(b.seat_label);
 }
 return input.routes.flatMap(route=>{
  const operator=operators.get(route?.operator_id);
  const vehicle=vehicles.get(route?.vehicle_id);
  if(operator?.operator_application_status!=='APPROVED'||operator?.verification_status!=='verified'||
     vehicle?.clearance_status!=='verified'||route?.is_active===false)return [];
  const departure=Date.parse(String(route?.departure_time||''));
  const capacity=Number(vehicle?.capacity||route?.capacity);
  const price=Number(route?.price_per_seat);
  const occupied=Array.from(booked.get(route.id)||[]);
  if(!Number.isFinite(departure)||departure<=input.nowMs||
     !Number.isSafeInteger(capacity)||capacity<1||capacity>200||
     !Number.isSafeInteger(price)||price<=0||
     occupied.length>=capacity||typeof route.id!=='string')return [];
  if(typeof route.origin!=='string'||!route.origin.trim()||
     typeof route.destination!=='string'||!route.destination.trim())return [];
  return [{
   id:route.id,vehicle_id:route.vehicle_id,route_name:route.name,
   origin:route.origin,destination:route.destination,departure_time:route.departure_time,
   price_xaf:price,total_seats:capacity,booked_seats:occupied.length,
   occupied_seats:occupied,available_seats:capacity-occupied.length,
   vehicle_type:vehicle?.type||route.vehicle_type||'taxi',
   operator_id:route.operator_id,operator_name:operator.full_name||'Opérateur vérifié AFAT',
   plate_number:vehicle?.plate_number||null,rating:vehicle?.rating??null,
   inventory_note:'Availability is provisional until an authenticated seat hold succeeds.',
  }];
 });
}
