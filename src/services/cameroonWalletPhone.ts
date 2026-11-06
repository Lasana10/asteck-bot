/** Cameroon wallet phone normalization for collection requests.
 * Accept a nine-digit mobile number, optionally prefixed by Cameroon country
 * code. Never interpret arbitrary length/format as an eligible payment target.
 * Mobile-number portability means the number prefix does not prove MTN/Orange.
 */
export function normalizeCameroonWalletPhone(value:unknown):string|null{
 if(typeof value!=='string'||value.length>40)return null;
 const cleaned=value.trim().replace(/[\s().-]/g,'');
 const local=cleaned.startsWith('+237')?cleaned.slice(4):
  cleaned.startsWith('00237')?cleaned.slice(5):
  cleaned.startsWith('237')?cleaned.slice(3):cleaned;
 if(!/^6\d{8}$/.test(local))return null;
 return '237'+local;
}
export function validCameroonCollectionNetwork(value:unknown):
 value is 'mtn_momo'|'orange_money'{
 return value==='mtn_momo'||value==='orange_money';
}
