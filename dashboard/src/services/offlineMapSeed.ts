/**
 * Render cached AFAT offline seed geography without conflating seed geometry
 * with an independently reviewed Atlas route, current traffic or live transport.
 * Data must come from the user's installed, first-party offline pack.
 */
export type OfflineSeedCollection = {
  type:'FeatureCollection';
  features:Array<{
    type:'Feature';
    properties:{name:string;source_only:true;review_status:'seed_unverified';kind:'road_seed'|'place_seed'};
    geometry:{type:'LineString';coordinates:number[][]}|{type:'Point';coordinates:number[]};
  }>;
};
const BOUNDS={south:3.7,north:4,west:11.4,east:11.7};
function point(value:unknown):value is number[] {
  return Array.isArray(value)&&value.length===2&&value.every(n=>typeof n==='number'&&Number.isFinite(n))&&
    value[0]>=BOUNDS.west&&value[0]<=BOUNDS.east&&value[1]>=BOUNDS.south&&value[1]<=BOUNDS.north;
}
function asCollection(value:unknown,kind:'road_seed'|'place_seed',maxFeatures:number):OfflineSeedCollection|null {
  if(!value||typeof value!=='object'||(value as any).type!=='FeatureCollection'||
    !Array.isArray((value as any).features)||(value as any).features.length>maxFeatures)return null;
  const accepted:OfflineSeedCollection['features']=[];
  for(const raw of (value as any).features){
    if(raw?.type!=='Feature'||!raw.geometry||typeof raw.geometry!=='object')return null;
    const geom=raw.geometry;
    if(kind==='road_seed'){
      if(geom.type!=='LineString'||!Array.isArray(geom.coordinates)||
        geom.coordinates.length<2||geom.coordinates.length>10000||!geom.coordinates.every(point))return null;
    }else if(geom.type!=='Point'||!point(geom.coordinates))return null;
    const name=typeof raw.properties?.name==='string'?
      raw.properties.name.trim().slice(0,100):'AFAT offline seed';
    accepted.push({
      type:'Feature',
      properties:{name,source_only:true,review_status:'seed_unverified',kind},
      geometry:kind==='road_seed'?
        {type:'LineString',coordinates:geom.coordinates}:
        {type:'Point',coordinates:geom.coordinates},
    });
  }
  return {type:'FeatureCollection',features:accepted};
}
export function validateOfflineYaoundeSeed(roads:unknown,places:unknown):
  {roads:OfflineSeedCollection;places:OfflineSeedCollection}|null {
  const validRoads=asCollection(roads,'road_seed',4000);
  const validPlaces=asCollection(places,'place_seed',5000);
  if(!validRoads?.features.length||!validPlaces)return null;
  return {roads:validRoads,places:validPlaces};
}
