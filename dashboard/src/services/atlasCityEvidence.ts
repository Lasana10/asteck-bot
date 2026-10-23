/**
 * Atlas city attribution uses the ACTIVE city registry and its operational
 * coverage envelope, not the contributor's account city or a fallback pin.
 * A working envelope is not legal jurisdiction, a verified road, or a promise
 * of automatic routing truth.
 */
export type AtlasCityProfile = {
  city_key: string;
  city_name: string;
  status: 'active' | string;
  metadata?: {
    coverage_working_envelope?: {
      south?: unknown; north?: unknown; west?: unknown; east?: unknown;
      basis?: string; automatic_truth?: boolean;
    };
  } | null;
};
export type CityFootprintResult = {
  allowed: boolean;
  reason: 'within_working_coverage'|'city_unavailable'|'coverage_unconfigured'|
    'invalid_fix'|'outside_working_coverage'|'uncertain_at_city_edge';
};
const slug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const numeric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function selectAtlasCityKey(profiles:AtlasCityProfile[], preferred?:string|null):string{
  const active=profiles.filter(p=>p.status==='active'&&p.city_key);
  const preferredSlug=slug(String(preferred||''));
  const matching=active.find(p=>preferredSlug&&(
    slug(p.city_key)===preferredSlug||
    slug(p.city_name)===preferredSlug||
    slug(p.city_key.replace(/^cm-/,''))===preferredSlug
  ));
  return matching?.city_key||(active.length===1?active[0].city_key:'');
}
export function assessAtlasCityFootprint(city:AtlasCityProfile|null|undefined,fix:{
  latitude:number;longitude:number;accuracyM:number|null;
}):CityFootprintResult{
  if(!city||city.status!=='active')return {allowed:false,reason:'city_unavailable'};
  if(!numeric(fix.latitude)||!numeric(fix.longitude)||!numeric(fix.accuracyM)||
    fix.latitude < -90||fix.latitude > 90||fix.longitude < -180||fix.longitude > 180||
    fix.accuracyM<0||fix.accuracyM>120)return {allowed:false,reason:'invalid_fix'};
  const box=city.metadata?.coverage_working_envelope;
  if(!box||![box.south,box.north,box.west,box.east].every(numeric))
    return {allowed:false,reason:'coverage_unconfigured'};
  const south=box.south as number,north=box.north as number;
  const west=box.west as number,east=box.east as number;
  if(south>=north||west>=east)return {allowed:false,reason:'coverage_unconfigured'};
  const latTolerance=fix.accuracyM/111_320;
  const longitudeDivisor=Math.max(1,111_320*Math.abs(Math.cos(fix.latitude*Math.PI/180)));
  const lngTolerance=fix.accuracyM/longitudeDivisor;
  const definitelyOutside=fix.latitude+latTolerance<south||fix.latitude-latTolerance>north||
    fix.longitude+lngTolerance<west||fix.longitude-lngTolerance>east;
  if(definitelyOutside)return {allowed:false,reason:'outside_working_coverage'};
  const completelyWithin=fix.latitude-latTolerance>=south&&fix.latitude+latTolerance<=north&&
    fix.longitude-lngTolerance>=west&&fix.longitude+lngTolerance<=east;
  return completelyWithin?{allowed:true,reason:'within_working_coverage'}:
    {allowed:false,reason:'uncertain_at_city_edge'};
}
export function cityFootprintMessage(reason:CityFootprintResult['reason'],cityName:string):string{
  switch(reason){
    case 'city_unavailable':return 'Select an active Atlas city before recording.';
    case 'coverage_unconfigured':return 'This city has no reviewed working coverage yet; AFAT will not guess its bounds.';
    case 'invalid_fix':return 'A reliable, measured GPS position is required before recording.';
    case 'outside_working_coverage':return `You are outside the active ${cityName} Atlas working coverage. No evidence was attributed to that city.`;
    case 'uncertain_at_city_edge':return 'GPS uncertainty overlaps the city coverage edge. Move farther inside or try for a more accurate fix.';
    default:return 'This position is within the selected city working area, pending normal evidence review.';
  }
}
