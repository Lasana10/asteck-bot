/** Short-lived bearer links never imply a privileged guardian account. */
export function guardianMinutes(value:unknown):number|null{
 if(value===undefined||value===null)return 180;
 return typeof value==='number'&&Number.isInteger(value)&&value>=5&&value<=240?value:null;
}
export function validGuardianToken(value:unknown):value is string{
 return typeof value==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(value);
}
export function guardianShareAllowed(booking:{
 passenger_id?:string|null;status?:string|null;payment_status?:string|null;
},requester:string):boolean{
 return booking.passenger_id===requester&&
  ['pending','accepted','confirmed','boarded','in_progress'].includes(String(booking.status||''))&&
  ['paid','paid_momo','paid_cash'].includes(String(booking.payment_status||''));
}
export function guardianWatchAvailable(booking:{status?:string|null},expiry:unknown,now=Date.now()):boolean{
 const end=Date.parse(String(expiry||''));
 return Number.isFinite(end)&&end>now&&end<=now+241*60_000&&
  !['cancelled','completed'].includes(String(booking.status||''));
}