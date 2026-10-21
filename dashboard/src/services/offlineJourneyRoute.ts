import type {AfatCanonicalRoute, AfatRouteMode} from './canonicalRouteClient';

// A bounded per-account navigation snapshot is not a routable offline road graph.
// Keep only the active journey, with its mode and exact selected arrival point.
const PREFIX='afat_offline_journey_route_v2:';
const LEGACY_PREFIX='afat_offline_journey_route_v1:';
const TTL_MS=48*60*60*1000;
const MAX_BYTES=750_000;
type CachedJourney={
 version:2;profileId:string;placeId:string;placeName:string;
 latitude:number;longitude:number;mode:AfatRouteMode;intentType:string;
 route:AfatCanonicalRoute;savedAt:string;
};
const key=(profileId:string)=>PREFIX+encodeURIComponent(profileId);
const legacyKey=(profileId:string)=>LEGACY_PREFIX+encodeURIComponent(profileId);
const validCoordinates=(latitude:number,longitude:number)=>
 Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
const destinationMatches=(aLat:number,aLon:number,bLat:number,bLon:number)=>
 Math.abs(aLat-bLat)<=0.00001&&Math.abs(aLon-bLon)<=0.00001;

export function routeCanBeKeptOffline(route:AfatCanonicalRoute):boolean{
 if(route.status!=='ok'||!['afat_atlas','osrm','google'].includes(String(route.route_source)))return false;
 if(!Number.isFinite(route.distance_m)||Number(route.distance_m)<=0||!Array.isArray(route.segments)||route.segments.length===0||route.segments.length>200)return false;
 const geometry=route.segments.flatMap(segment=>segment.geometry?.coordinates||[]);
 return geometry.length>=2&&geometry.length<=50000&&geometry.every(c=>Array.isArray(c)&&c.length===2&&
   typeof c[0]==='number'&&typeof c[1]==='number'&&validCoordinates(c[1],c[0]));
}

export function storeOfflineJourneyRoute(input:{
 profileId:string;placeId:string;placeName:string;latitude:number;longitude:number;
 mode:AfatRouteMode;intentType:string;route:AfatCanonicalRoute;
},storage:Storage=localStorage):boolean{
 if(!input.profileId||!input.placeId||!input.placeName||
   !validCoordinates(input.latitude,input.longitude)||input.route.mode!==input.mode||
   !routeCanBeKeptOffline(input.route))return false;
 const item:CachedJourney={version:2,...input,savedAt:new Date().toISOString()};
 const json=JSON.stringify(item);
 if(json.length>MAX_BYTES)return false;
 try{
   storage.setItem(key(input.profileId),json);
   storage.removeItem(legacyKey(input.profileId));
   return true;
 }catch{return false;}
}

export function loadOfflineJourneyRoute(
 profileId:string,placeId:string,storage:Storage=localStorage,
 expected?:{mode?:AfatRouteMode;latitude?:number;longitude?:number},
):CachedJourney|null{
 if(!profileId||!placeId)return null;
 try{
  const raw=storage.getItem(key(profileId));
  if(!raw||raw.length>MAX_BYTES)return null;
  const item=JSON.parse(raw) as CachedJourney;
  const age=Date.now()-Date.parse(item.savedAt);
  if(item.version!==2||item.profileId!==profileId||item.placeId!==placeId||
    !Number.isFinite(age)||age<0||age>TTL_MS||!validCoordinates(item.latitude,item.longitude)||
    item.route?.mode!==item.mode||!routeCanBeKeptOffline(item.route))return null;
  if(expected?.mode && item.mode!==expected.mode)return null;
  if(expected?.latitude!==undefined||expected?.longitude!==undefined){
    if(!validCoordinates(Number(expected.latitude),Number(expected.longitude))||
      !destinationMatches(item.latitude,item.longitude,Number(expected.latitude),Number(expected.longitude)))return null;
  }
  return item;
 }catch{return null;}
}
export function clearOfflineJourneyRoute(profileId:string,storage:Storage=localStorage){
 if(!profileId)return;
 try{storage.removeItem(key(profileId));storage.removeItem(legacyKey(profileId));}catch{}
}
