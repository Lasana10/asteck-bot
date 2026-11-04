import {supabase} from '../supabaseClient';

/** Paid boarding passes are recovered only from authenticated server bookings.
 * The actual QR signature is freshly issued by /api/ticket/issue on TicketView.
 */
export type RecoverablePaidTicket={
 id:string;routeName:string;origin:string;destination:string;seatLabel:string;
 price:number;operatorName:string;plateNumber:string;departureTime:string;
 transactionId:string;paymentMethod:'mtn_momo'|'orange_money'|'mobile_money';
};
export async function fetchRecoverablePaidTickets(profileId:string,now=Date.now()):
 Promise<{data:RecoverablePaidTicket[];error:{message:string}|null}>{
 const {data:auth,error:identityError}=await supabase.auth.getUser();
 if(identityError||!profileId||auth.user?.id!==profileId)
  return {data:[],error:{message:'Sign in to your own passenger account before recovering a paid ticket.'}};
 const {data,error}=await supabase.from('bookings')
  .select('id,passenger_id,operator_id,status,payment_status,price_paid,price_xaf,seat_label,transaction_id,created_at,routes(name,origin,destination,departure_time),vehicles(plate_number),profiles!operator_id(full_name)')
  .eq('passenger_id',profileId).eq('status','confirmed')
  .in('payment_status',['paid','paid_momo','paid_cash'])
  .order('created_at',{ascending:false}).limit(30);
 if(error)return {data:[],error:{message:error.message}};
 const results:RecoverablePaidTicket[]=[];
 for(const item of data||[]){
  if(item.passenger_id!==profileId||item.status!=='confirmed'||
   !['paid','paid_momo','paid_cash'].includes(String(item.payment_status)))continue;
  const route=Array.isArray(item.routes)?item.routes[0]:item.routes;
  const operator=Array.isArray(item.profiles)?item.profiles[0]:item.profiles;
  const vehicle=Array.isArray(item.vehicles)?item.vehicles[0]:item.vehicles;
  const depart=String(route?.departure_time||'');
  const amount=Number(item.price_paid??item.price_xaf);
  if(!item.id||!item.seat_label||!item.transaction_id||
   !Number.isSafeInteger(amount)||amount<=0||
   !Number.isFinite(Date.parse(depart))||Date.parse(depart)<=now||
   !route?.origin||!route?.destination||!operator?.full_name)continue;
  results.push({
   id:String(item.id),routeName:String(route.name||'Verified departure'),
   origin:String(route.origin),destination:String(route.destination),
   seatLabel:String(item.seat_label),price:amount,operatorName:String(operator.full_name),
   plateNumber:String(vehicle?.plate_number||'Not provided'),
   departureTime:depart,transactionId:String(item.transaction_id),
   paymentMethod:item.payment_status==='paid_cash'?'cash':'mobile_money',
  });
 }
 return {data:results.slice(0,10),error:null};
}
