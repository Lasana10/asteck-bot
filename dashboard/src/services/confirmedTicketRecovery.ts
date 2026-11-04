import {supabase} from '../supabaseClient';
export type ConfirmedPassengerTicket={
 id:string;routeName:string;origin:string;destination:string;
 seatLabel:string;price:number;operatorName:string;plateNumber:string;
 departureTime:string;transactionId:string;paymentMethod:string;
};
export function projectConfirmedPassengerTicket(raw:any,now=Date.now()):ConfirmedPassengerTicket|null{
 if(!raw||raw.status!=='confirmed'||!['paid','paid_momo'].includes(raw.payment_status)||!raw.transaction_id||
    typeof raw.transaction_id!=='string'||raw.transaction_id.length>120||
    !raw.seat_label||typeof raw.seat_label!=='string'||!raw.id)return null;
 const route=Array.isArray(raw.routes)?raw.routes[0]:raw.routes;
 const vehicle=Array.isArray(raw.vehicles)?raw.vehicles[0]:raw.vehicles;
 const operator=Array.isArray(raw.profiles)?raw.profiles[0]:raw.profiles;
 const departureTime=String(route?.departure_time||'');
 const amount=Number(raw.price_paid??raw.price_xaf);
 if(!route?.origin||!route?.destination||!vehicle?.plate_number||
    !Number.isFinite(Date.parse(departureTime))||Date.parse(departureTime)<=now||
    !Number.isSafeInteger(amount)||amount<=0)return null;
 return {id:String(raw.id),routeName:String(route.name||'Confirmed departure'),
  origin:String(route.origin),destination:String(route.destination),
  seatLabel:String(raw.seat_label),price:amount,
  operatorName:String(operator?.full_name||'Verified AFAT operator'),
  plateNumber:String(vehicle.plate_number),departureTime,
  transactionId:raw.transaction_id,paymentMethod:'provider_confirmed'};
}
/** A recovered ticket is reissued using the server's signed QR endpoint. */
export async function fetchConfirmedPassengerTickets(profileId:string){
 const empty=[] as ConfirmedPassengerTicket[];
 const {data:identity,error:authError}=await supabase.auth.getUser();
 if(authError||identity.user?.id!==profileId)
  return {data:empty,error:{message:'Authenticate as the passenger who owns the ticket.'}};
 const {data,error}=await supabase.from('bookings')
  .select('id,passenger_id,status,payment_status,price_paid,price_xaf,seat_label,transaction_id,created_at,routes(name,origin,destination,departure_time),vehicles(plate_number),profiles!operator_id(full_name)')
  .eq('passenger_id',profileId).eq('status','confirmed').in('payment_status',['paid','paid_momo'])
  .order('created_at',{ascending:false}).limit(20);
 if(error)return {data:empty,error:{message:error.message}};
 return {data:(data||[]).flatMap(raw=>{
   const item=projectConfirmedPassengerTicket(raw);
   return item?[item]:[];
  }),error:null};
}
