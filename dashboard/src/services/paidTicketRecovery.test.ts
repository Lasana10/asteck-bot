import {beforeEach,describe,expect,it,vi} from 'vitest';
const {auth,from}=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{auth:{getUser:auth},from}}));
import {fetchRecoverablePaidTickets} from './paidTicketRecovery';
const now=Date.parse('2026-11-04T11:00:00Z');
const row={id:'booking-1',passenger_id:'passenger',operator_id:'operator',
 status:'confirmed',payment_status:'paid_momo',price_paid:4800,
 seat_label:'27',transaction_id:'gateway-123',
 routes:{name:'Real operator departure',origin:'Yaoundé',destination:'Douala',departure_time:'2026-11-05T06:00:00Z'},
 vehicles:{plate_number:'CE-123'},profiles:{full_name:'Cleared operator'}};
beforeEach(()=>{auth.mockReset();from.mockReset();});
function records(rows:any[]){
 const chain:any={};
 for(const key of ['select','eq','in','order'])chain[key]=vi.fn().mockReturnValue(chain);
 chain.limit=vi.fn().mockResolvedValue({data:rows,error:null});
 from.mockReturnValue(chain);
 return chain;
}
describe('paid QR ticket server recovery',()=>{
 it('denies account mismatch before querying booking data',async()=>{
  auth.mockResolvedValue({data:{user:{id:'another'}},error:null});
  const result=await fetchRecoverablePaidTickets('passenger',now);
  expect(result.data).toEqual([]);expect(result.error).toBeTruthy();
  expect(from).not.toHaveBeenCalled();
 });
 it('restores only future paid confirmed ticket details with provider reference',async()=>{
  auth.mockResolvedValue({data:{user:{id:'passenger'}},error:null});
  const chain=records([row,{...row,id:'old',routes:{...row.routes,departure_time:'2026-11-03T06:00:00Z'}},
   {...row,id:'cash',payment_status:'cash_due'},
   {...row,id:'cancelled',status:'cancelled'},
   {...row,id:'stranger',passenger_id:'other'},
   {...row,id:'unreferenced',transaction_id:null}]);
  const result=await fetchRecoverablePaidTickets('passenger',now);
  expect(result.data).toHaveLength(1);
  expect(result.data[0]).toMatchObject({id:'booking-1',seatLabel:'27',price:4800,transactionId:'gateway-123'});
  expect(chain.eq).toHaveBeenCalledWith('passenger_id','passenger');
  expect(chain.eq).toHaveBeenCalledWith('status','confirmed');
  expect(chain.in).toHaveBeenCalledWith('payment_status',['paid','paid_momo','paid_cash']);
 });
});
