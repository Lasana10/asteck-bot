export type SensingProfile='saver'|'balanced'|'survey';

export type SensingContext={
  profile:SensingProfile;
  speedKph?:number|null;
  accuracyM?:number|null;
  matched?:boolean|null;
  hidden?:boolean;
  batteryLevel?:number|null;
  charging?:boolean|null;
  connection?:'slow'|'normal'|'fast'|'offline';
  sessionMinutes?:number;
};

export type SensingDecision={
  minimumIntervalMs:number;
  enableHighAccuracy:boolean;
  maximumAgeMs:number;
  reason:string[];
};

export function decideSensing(ctx:SensingContext):SensingDecision{
  const reason:string[]=[];
  const speed=Math.max(0,Number(ctx.speedKph||0));
  const lowBattery=ctx.batteryLevel!=null&&ctx.batteryLevel<=0.18&&!ctx.charging;
  const stationary=speed<1.2;
  const weakFix=ctx.accuracyM!=null&&ctx.accuracyM>45;
  const unknown=ctx.matched===false;

  let minimumIntervalMs=ctx.profile==='survey'?3000:ctx.profile==='saver'?12000:6000;
  let enableHighAccuracy=ctx.profile!=='saver';
  let maximumAgeMs=ctx.profile==='survey'?2500:ctx.profile==='saver'?15000:7000;

  if(stationary){minimumIntervalMs=Math.max(minimumIntervalMs,20000);reason.push('stationary');}
  if(ctx.hidden){minimumIntervalMs=Math.max(minimumIntervalMs,15000);reason.push('background-throttle');}
  if(lowBattery){minimumIntervalMs=Math.max(minimumIntervalMs,18000);enableHighAccuracy=false;reason.push('low-battery');}
  if(ctx.connection==='offline'||ctx.connection==='slow'){minimumIntervalMs=Math.max(minimumIntervalMs,9000);reason.push('network-batch');}
  if(unknown||weakFix){
    minimumIntervalMs=Math.min(minimumIntervalMs,ctx.profile==='saver'?8000:3500);
    enableHighAccuracy=!lowBattery;
    maximumAgeMs=Math.min(maximumAgeMs,3500);
    reason.push(unknown?'unknown-road':'weak-fix');
  }
  if(speed>45&&ctx.profile!=='saver'){minimumIntervalMs=Math.min(minimumIntervalMs,4500);reason.push('fast-movement');}
  if((ctx.sessionMinutes||0)>120&&!ctx.charging){minimumIntervalMs=Math.max(minimumIntervalMs,9000);reason.push('long-session');}

  return {minimumIntervalMs,enableHighAccuracy,maximumAgeMs,reason};
}

export async function readDeviceSensingContext(){
  const n=navigator as any;
  let batteryLevel:number|null=null,charging:boolean|null=null;
  try{
    if(typeof n.getBattery==='function'){
      const b=await n.getBattery(); batteryLevel=Number(b.level); charging=Boolean(b.charging);
    }
  }catch{}
  const c=n.connection||n.mozConnection||n.webkitConnection;
  let connection:'slow'|'normal'|'fast'|'offline'=navigator.onLine?'normal':'offline';
  if(navigator.onLine&&c){
    const effective=String(c.effectiveType||'');
    if(effective==='slow-2g'||effective==='2g') connection='slow';
    else if(effective==='4g') connection='fast';
  }
  return {batteryLevel,charging,connection};
}
