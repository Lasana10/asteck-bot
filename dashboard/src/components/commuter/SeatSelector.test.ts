import {describe,it,expect,vi} from 'vitest';
vi.mock('../../supabaseClient',()=>({
 fetchSelectedDepartureAvailability:vi.fn(),
 supabase:{channel:vi.fn()},
}));
import {generateBlueprint,realSeatLabelForSelection} from './SeatSelector';

describe('passenger seat → server hold contract',()=>{
 it('sends the visible real seat label rather than its screen-grid coordinate',()=>{
  const layout=generateBlueprint('minibus',[],14);
  const seat=layout.seats.find(s=>s.label==='7');
  expect(seat).toBeTruthy();
  expect(seat?.id).not.toBe(seat?.label);
  expect(realSeatLabelForSelection(
    layout.seats.map(s=>s.id===seat?.id?{...s,status:'selected' as const}:s),
    seat?.id||null,true,
  )).toBe('7');
 });
 it('refuses booked, over-capacity or unverified seat inventory',()=>{
  const blueprint=generateBlueprint('minibus',['3'],9);
  expect(blueprint.seats.find(s=>s.label==='3')?.status).toBe('booked');
  expect(blueprint.seats.find(s=>s.label==='10')?.status).toBe('locked');
  const seat=blueprint.seats.find(s=>s.label==='7')!;
  const selected=blueprint.seats.map(s=>s.id===seat.id?{...s,status:'selected' as const}:s);
  expect(realSeatLabelForSelection(selected,seat.id,false)).toBeNull();
  expect(realSeatLabelForSelection(selected,'seat-fake',true)).toBeNull();
  expect(realSeatLabelForSelection(blueprint.seats,seat.id,true)).toBeNull();
 });
});

describe('large verified capacity seats and label uniqueness',()=>{
 it('offers 200 unique numeric seats when server capacity is 200',()=>{
  const seats=generateBlueprint('bus',[],200).seats;
  expect(seats.filter(s=>s.status==='available')).toHaveLength(200);
  expect(new Set(seats.map(s=>s.label)).size).toBe(seats.length);
  expect(seats.find(s=>s.label==='200')?.status).toBe('available');
 });
 it('rejects physical capacity beyond published 200 maximum and reserves aliases',()=>{
  expect(generateBlueprint('bus',[],201).seats.every(s=>s.status==='locked')).toBe(true);
  const seats=generateBlueprint('bus',['A1','02','3'],45).seats;
  for(const label of ['1','2','3'])expect(seats.find(s=>s.label===label)?.status).toBe('booked');
  expect(seats.find(s=>s.label==='45')?.status).toBe('available');
 });
});
