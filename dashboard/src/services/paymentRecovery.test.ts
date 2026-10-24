import {beforeEach,describe,expect,it,vi} from 'vitest';
const {auth,rpc,from}=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{auth:{getUser:auth},rpc,from}}));
import {paymentPhaseFromBooking,fetchRecoverablePassengerPayments} from './paymentRecovery';
describe('passenger payment duplicate prevention and account-scoped recovery',()=>{
 beforeEach(()=>{auth.mockReset();rpc.mockReset();from.mockReset();});
 it('holds collection_pending without transaction reference and never treats pending as paid',()=>{
  expect(paymentPhaseFromBooking({status:'pending',payment_status:'collection_pending'}).phase).toBe('pending');
  expect(paymentPhaseFromBooking({status:'pending',payment_status:'paid_momo',transaction_id:'ref1'})).toEqual({phase:'paid',transactionId:'ref1'});
 });
 it('rejects terminal/cancelled bookings, cash due and unknown records as new payment candidates',()=>{
  expect(paymentPhaseFromBooking({status:'cancelled',payment_status:'unpaid'}).phase).toBe('blocked');
  expect(paymentPhaseFromBooking({status:'pending',payment_status:'cash_due'}).phase).toBe('cash_due');
  expect(paymentPhaseFromBooking(null).phase).toBe('unknown');
  expect(paymentPhaseFromBooking({status:'pending',payment_status:'failed'}).phase).toBe('ready');
 });
 it('does not list another passenger account or start any financial writes',async()=>{
  auth.mockResolvedValue({data:{user:{id:'someone-else'}},error:null});
  const result=await fetchRecoverablePassengerPayments('alice');
  expect(result.error).toBeTruthy();expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it('reconstructs only authentic unpaid and pending bookings from owner-filtered server query',async()=>{
  auth.mockResolvedValue({data:{user:{id:'alice'}},error:null});
  const rows=[{id:'booking1',status:'pending',payment_status:'collection_pending',
    passenger_id:'alice',price_paid:3500,seat_label:'A2',
    routes:{name:'Source departure',origin:'Mendong',destination:'Mvan',departure_time:'2026-11-03T10:00:00Z'},
    profiles:{full_name:'Operator'},vehicles:{plate_number:'LT 123'}},
    {id:'booking2',status:'cancelled',payment_status:'unpaid',price_paid:2500,seat_label:'B1'}];
  const chain:any={};for(const key of ['select','eq','in','order'])chain[key]=vi.fn().mockReturnValue(chain);
  chain.limit=vi.fn().mockResolvedValue({data:rows,error:null});from.mockReturnValue(chain);
  const result=await fetchRecoverablePassengerPayments('alice');
  expect(from).toHaveBeenCalledWith('bookings');
  expect(chain.eq).toHaveBeenCalledWith('passenger_id','alice');
  expect(result.data).toHaveLength(1);
  expect(result.data[0]).toMatchObject({id:'booking1',seatLabel:'A2',amountXaf:3500});
  expect(rpc).not.toHaveBeenCalled();
 });
});
