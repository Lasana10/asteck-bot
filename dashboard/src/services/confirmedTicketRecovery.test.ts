import {describe,it,expect,vi} from 'vitest';
vi.mock('../supabaseClient',()=>({supabase:{auth:{getUser:vi.fn()},from:vi.fn()}}));
import {projectConfirmedPassengerTicket} from './confirmedTicketRecovery';
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
  for(const status of ['cash_due','unpaid','failed','collection_pending','refunded','paid_momo']){
   expect(projectConfirmedPassengerTicket({...booking,payment_status:status},now)).toBeNull();
  }
  for(const status of ['pending','boarded','in_progress','completed','cancelled']){
   expect(projectConfirmedPassengerTicket({...booking,status},now)).toBeNull();
  }
 });
 it('fails closed when a provider reference or real future departure is absent',()=>{
  expect(projectConfirmedPassengerTicket({...booking,transaction_id:null},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,routes:null},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,price_paid:0},now)).toBeNull();
  expect(projectConfirmedPassengerTicket({...booking,routes:{...booking.routes,departure_time:'2025-01-01T12:00:00Z'}},now)).toBeNull();
 });
});
