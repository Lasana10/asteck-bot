/**
 * Operator-submitted vehicle facts are declarations for staff review.
 * Registration NEVER grants route inventory, live dispatch or cleared supply.
 */
export function validateOperatorVehicleRegistration(raw:unknown){
 const v=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 const plate=typeof v.plate_number==='string'?v.plate_number.toUpperCase().replace(/\s+/g,' ').trim():'';
 const type=typeof v.vehicle_type==='string'?v.vehicle_type.trim().toLowerCase():'';
 const capacity=v.capacity;
 const allowed=['moto','taxi','minibus','bus','private'];
 if(!/^[A-Z0-9 -]{4,24}$/.test(plate))throw Error('VALID_REGISTRATION_PLATE_REQUIRED');
 if(!allowed.includes(type))throw Error('SUPPORTED_TRANSPORT_VEHICLE_TYPE_REQUIRED');
 if(typeof capacity!=='number'||!Number.isSafeInteger(capacity)||capacity<1||capacity>200)
  throw Error('REAL_PASSENGER_CAPACITY_REQUIRED');
 return {plate_number:plate,type,capacity};
}
