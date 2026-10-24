import axios from 'axios';
import type { Coordinates } from '../types';
import type { DirectionsResult, RoadManeuver, RouteResult } from './directions';

/**
 * Strictly opt-in, AFAT-controlled Valhalla complementary mode routing.
 * No public demo endpoint, no user-supplied URL, no exposure of a private host
 * and no claim of live traffic, transit availability or independently verified passability.
 * Valhalla API: POST /route, costing=bicycle|motorcycle, shape_format=geojson.
 */
export function validatedValhallaBase(raw:string, allowPrivateHttp=false):string|null {
  if (!raw.trim()) return null;
  try {
    const u=new URL(raw);
    if(u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;
    const local=['localhost','127.0.0.1'].includes(u.hostname);
    const renderPrivate=allowPrivateHttp&&/^[a-z][a-z0-9-]*-[a-z0-9]+$/.test(u.hostname);
    if(u.protocol!=='https:' && !(u.protocol==='http:'&&(local||renderPrivate)))return null;
    return u.origin;
  }catch{return null;}
}
const validCoordinate=(lat:number,lon:number)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
export function valhallaPayload(a:Coordinates,b:Coordinates,mode:'bicycle'|'motorcycle'){
 if(!validCoordinate(a.latitude,a.longitude)||!validCoordinate(b.latitude,b.longitude))throw Error('Invalid coordinates');
 return {locations:[{lat:a.latitude,lon:a.longitude},{lat:b.latitude,lon:b.longitude}],
  costing:mode,units:'kilometers',language:'en-US',directions_type:'instructions',shape_format:'geojson'};
}
function geometryFromTrip(leg:any):number[][]|null{
 let shape=leg?.shape;
 if(typeof shape==='string') {
  try{shape=JSON.parse(shape);}catch{return null;}
 }
 const coords=shape?.type==='LineString'?shape.coordinates:null;
 if(!Array.isArray(coords)||coords.length<2||coords.length>50000)return null;
 if(!coords.every((p:unknown)=>Array.isArray(p)&&p.length===2&&
  typeof p[0]==='number'&&typeof p[1]==='number'&&validCoordinate(p[1],p[0])))return null;
 return coords;
}
export function parseValhallaResponse(data:unknown):DirectionsResult|null{
 if(!data||typeof data!=='object')return null;
 const trip=(data as any).trip;
 if(!trip||!Array.isArray(trip.legs)||trip.legs.length!==1)return null;
 const leg=trip.legs[0],points=geometryFromTrip(leg);
 const summary=trip.summary || leg.summary;
 const distanceKm=Number(summary?.length),seconds=Number(summary?.time);
 if(!points||!Number.isFinite(distanceKm)||distanceKm<=0||distanceKm>5000||
    !Number.isFinite(seconds)||seconds<=0||seconds>2592000)return null;
 const maneuvers:RoadManeuver[] = Array.isArray(leg.maneuvers)?
    leg.maneuvers.slice(0,300).flatMap((m:any)=>{
      const at=Number(m?.begin_shape_index);
      const instruction=typeof m?.instruction==='string'?m.instruction.trim():'';
      const meters=Number(m?.length);
      if(!Number.isInteger(at)||at<0||at>=points.length||!instruction||instruction.length>180||
         !Number.isFinite(meters)||meters<0)return [];
      const p=points[at];
      return [{latitude:p[1],longitude:p[0],instruction,
        distanceMeters:meters*1000,kind:String(m.type??'continue').slice(0,48)}];
    }):[];
 const route:RouteResult={summary:'Valhalla mapped route',distance:distanceKm.toFixed(1)+' km',
  distanceMeters:distanceKm*1000,duration:Math.round(seconds/60)+' min',durationValue:seconds,
  startAddress:'',endAddress:'',steps:maneuvers.slice(0,8).map(x=>x.instruction),
  geometry:{type:'LineString',coordinates:points},maneuvers,
  warnings:['Unverified external OSM network geometry. No live road, passage, accessibility or transit availability verification.']};
 return {source:'valhalla',primary:route,alternatives:[]};
}
export async function valhallaMicromobilityDirections(
 a:Coordinates,b:Coordinates,mode:'bicycle'|'motorcycle',
):Promise<DirectionsResult|null>{
 const url=validatedValhallaBase(process.env.AFAT_VALHALLA_BASE_URL||'',
  process.env.AFAT_ALLOW_PRIVATE_VALHALLA_HTTP==='true');
 if(!url||process.env.AFAT_VALHALLA_ENABLED!=='true')return null;
 try {
  const payload=valhallaPayload(a,b,mode);
  const response=await axios.post(url+'/route',payload,{
    timeout:9000,maxRedirects:0,maxContentLength:5_000_000,
    headers:{'content-type':'application/json'},
  });
  return parseValhallaResponse(response.data);
 }catch{return null;}
}
