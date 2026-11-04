import React,{useEffect,useRef,useState} from 'react';
import {verifyBoardingToken} from '../../supabaseClient';
import {parseSignedQrContent,type UnsignedInputTicket} from '../../services/signedTicketScan';
type Scanner={detect:(video:HTMLVideoElement)=>Promise<Array<{rawValue:string}>>};
type BarcodeDetectorCtor=new(options:{formats:string[]})=>Scanner;

/** Camera or pasted signed ticket, with server-only boarding authority. */
export function OperatorTicketScanner({onVerified}:{onVerified:()=>void}){
 const [cameraOn,setCameraOn]=useState(false);
 const [raw,setRaw]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [lastBooking,setLastBooking]=useState('');
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const cameraRef=useRef<MediaStream|null>(null);
 useEffect(()=>{
  if(!cameraOn)return;
  let disposed=false,scanning=false;
  let interval:number|undefined;
  const start=async()=>{
   try{
    const native=(window as unknown as {BarcodeDetector?:BarcodeDetectorCtor}).BarcodeDetector;
    if(!native||!navigator.mediaDevices?.getUserMedia)
     throw new Error('QR camera scanning is not supported in this browser. Paste the signed ticket QR text instead.');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(disposed){stream.getTracks().forEach(track=>track.stop());return;}
    cameraRef.current=stream;
    const video=videoRef.current;
    if(!video){stream.getTracks().forEach(track=>track.stop());return;}
    video.srcObject=stream;
    await video.play();
    const detector=new native({formats:['qr_code']});
    interval=window.setInterval(()=>{
     if(scanning||disposed||!video.videoWidth)return;
     scanning=true;
     void detector.detect(video).then(codes=>{
      if(disposed)return;
      for(const code of codes){
       if(parseSignedQrContent(code.rawValue)){
        setRaw(code.rawValue);
        setNotice('Signed QR text captured. Review and confirm with AFAT server to record boarding.');
        setCameraOn(false);
        break;
       }
      }
     }).catch(()=>{}).finally(()=>{scanning=false;});
    },550);
   }catch(error:any){
    if(!disposed){setNotice(error?.message||'Unable to start QR camera.');setCameraOn(false);}
   }
  };
  void start();
  return()=>{
   disposed=true;
   if(interval!==undefined)window.clearInterval(interval);
   cameraRef.current?.getTracks().forEach(track=>track.stop());
   cameraRef.current=null;
   if(videoRef.current)videoRef.current.srcObject=null;
  };
 },[cameraOn]);
 const ticket:UnsignedInputTicket|null=parseSignedQrContent(raw.trim());
 const verify=async()=>{
  if(!ticket||busy)return;
  if(!navigator.onLine){setNotice('Offline: the operator cannot confirm boarding without the AFAT server.');return;}
  setBusy(true);setNotice('');setLastBooking('');
  const {data,error}=await verifyBoardingToken(ticket,'');
  setBusy(false);
  if(error||data?.success!==true||!data?.booking_id){
   setNotice(error?.message||'Ticket could not be verified. No boarding event was recorded.');
   return;
  }
  setLastBooking(String(data.booking_id));
  setRaw('');
  setNotice('The AFAT server verified the signed ticket and recorded boarding. Check the refreshed departure manifest.');
  onVerified();
 };
 return <section className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4" aria-label="Operator signed-ticket verifier">
  <h4 className="text-xs font-black text-emerald-100">Signed ticket boarding verification</h4>
  <p className="mt-2 text-[10px] leading-5 text-white/60">Scan the passenger’s AFAT QR ticket or paste its signed QR text. A camera scan does not board the passenger; only AFAT’s authenticated, operator-owned server verification can do so. No offline boarding claims.</p>
  <button type="button" disabled={busy} onClick={()=>{setNotice('');setCameraOn(current=>!current);}}
    className="mt-3 min-h-10 rounded-lg border border-emerald-300/25 px-3 text-[10px] font-bold text-emerald-100 disabled:opacity-40">
    {cameraOn?'Stop camera':'Scan QR with camera'}
  </button>
  {cameraOn&&<video ref={videoRef} autoPlay muted playsInline aria-label="Live QR camera preview" className="mt-3 aspect-video w-full max-w-sm rounded-xl border border-white/10 bg-black object-cover"/>}
  <label className="mt-3 block text-[10px] text-white/60">Signed QR ticket data
   <textarea value={raw} maxLength={4096} rows={2} autoComplete="off"
    onChange={event=>{setRaw(event.target.value);setLastBooking('');setNotice('');}}
    placeholder='Paste the complete JSON signed ticket QR text, not a booking number'
    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[10px] text-white"/>
  </label>
  {raw&&!ticket&&<p role="alert" className="mt-2 text-[10px] text-amber-200">QR text is incomplete or invalid. No ticket is trusted or boarded.</p>}
  <button type="button" disabled={!ticket||busy||cameraOn} onClick={()=>void verify()}
   className="mt-3 min-h-11 rounded-xl bg-emerald-300 px-4 text-[10px] font-black text-slate-950 disabled:opacity-40">
   {busy?'Checking booking and signature…':'Verify signed ticket and record boarding'}
  </button>
  {notice&&<p role="status" className="mt-3 text-[10px] text-white/70">{notice}</p>}
  {lastBooking&&<p className="mt-2 text-[10px] text-emerald-100">Server confirmed booking: {lastBooking.slice(0,8)}…</p>}
 </section>;
}