import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn()}));
vi.mock('../supabaseClient',()=>({supabase:{auth:{getUser:mocks.getUser},from:mocks.from}}));
import {projectConfirmedPassengerTicket,fetchConfirmedPassengerTickets} from './confirmedTicketRecovery';
const now=Date.parse('2026-11-04T08:00:00Z');
const booking={
 id:'confirmed',status:'confirmed',payment_status:'paid',
 transaction_id:'verified-provider-reference',seat_label:'15',price_paid:5500,
 routes:{name:'Intercity route',origin:'Yaoundé',destination:'Douala',departure_time:'2026-11-05T10:00:00Z'},
 vehicles:{plate_number:'REAL-PLATE'},profiles:{full_name:'Verified operator'},
};
describe('AFAT paid ticket reissue eligibility',()=>{
 it('projects server-confirmed paid passenger booking with future departure',()=>{
  expect(projectConfirmedPassengerTicket(booking,now)).toMatchObject({
   id:'confirmed',seatLabel:'15',price:5500,origin:'Yaoundé',transactionId:'verified-provider-reference',
  });
 });
 it('refuses cash due, pending provider collection, cancelled and unconfirmed bookings',()=>{
  for(const status of ['cash_due','unpaid','failed','collection_pending','refunded']){
   expect(projectConfirmedPassengerTicket({...booking,payment_status:status},now)).toBeNull();
  }
  for(const status of ['pending','boarded','in_progress','completed','cancelled']){
   expect(projectConfirmedPassengerTicket({...booking,status},now)).toBeNull();
  }
 });
 it('accepts provider-confirmed momo while rejecting unknown cash settlement',()=>{
  expect(projectConfirmedPassengerTicket({...booking,payment_status:'paid_momo'},now)).not.toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,payment_status:'paid_cash'},now)).toBeNull();
 });
 it('fails closed when a provider reference or real future departure is absent',()=>{
  expect(projectConfirmedPassengerTicket({...booking,transaction_id:null},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,routes:null},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,price_paid:0},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,routes:{...booking.routes,departure_time:'2025-01-01T12:00:00Z'}},now)).toBeNull();
 });
});

describe('authenticated ticket history access',()=>{
 beforeEach(()=>{mocks.getUser.mockReset();mocks.from.mockReset();});
 it('never queries another passenger’s tickets',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'other'}},error:null});
  const result=await fetchConfirmedPassengerTickets('requester');
  expect(result.data).toEqual([]);
  expect(result.error?.message).toContain('Authenticate');
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('queries only authenticated owner and confirmed paid states',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'passenger'}},error:null});
  const chain:any={eq:vi.fn(()=>chain),in:vi.fn(()=>chain),order:vi.fn(()=>chain),
   limit:vi.fn().mockResolvedValue({data:[booking],error:null})};
  mocks.from.mockReturnValue({select:vi.fn(()=>chain)});
  const result=await fetchConfirmedPassengerTickets('passenger');
  expect(mocks.from).toHaveBeenCalledWith('bookings');
  expect(chain.eq).toHaveBeenCalledWith('passenger_id','passenger');
  expect(chain.eq).toHaveBeenCalledWith('status','confirmed');
  expect(chain.in).toHaveBeenCalledWith('payment_status',['paid','paid_momo']);
  expect(result.data.length).toBeLessThanOrEqual(1);
 });
});
