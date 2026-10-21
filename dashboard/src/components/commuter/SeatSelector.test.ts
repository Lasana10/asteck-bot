import {describe,it,expect,vi} from 'vitest';
vi.mock('../../supabaseClient',()=>({
 fetchPublishedDepartures:vi.fn(),
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
