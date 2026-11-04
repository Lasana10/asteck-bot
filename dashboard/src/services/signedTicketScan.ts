/** Parsed QR content is UNTRUSTED until the backend verifies the HMAC and booking state. */
export type UnsignedInputTicket={t:string;s:string};
export function parseSignedQrContent(value:string):UnsignedInputTicket|null{
 if(typeof value!=='string'||value.length<15||value.length>4096)return null;
 try{
  const parsed=JSON.parse(value);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
    typeof parsed.t!=='string'||typeof parsed.s!=='string')return null;
  if(!/^[A-Za-z0-9_-]{16,3000}$/.test(parsed.t))return null;
  if(!/^[a-fA-F0-9]{64}$/.test(parsed.s))return null;
  return {t:parsed.t,s:parsed.s};
 }catch{return null;}
}
