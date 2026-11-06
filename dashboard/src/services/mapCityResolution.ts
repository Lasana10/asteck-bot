/** Known AFAT map bootstrap cities. This registry describes a map viewport,
 * never claims an operational transport marketplace or fully verified Atlas.
 * Unknown cities must not silently inherit Yaoundé geography.
 */
export type AfatMappedCity={
 cityKey:'cm-yaounde'|'cm-douala';
 center:[longitude:number,latitude:number];
 displayName:string;
};
const BOOTSTRAP_CITIES:readonly AfatMappedCity[]=[
 {cityKey:'cm-yaounde',center:[11.514,3.866],displayName:'Yaoundé'},
 {cityKey:'cm-douala',center:[9.7043,4.0511],displayName:'Douala'},
];
export function resolveAfatMappedCity(city?:string|null):AfatMappedCity|null{
 if(typeof city!=='string'||city.trim().length<2)return null;
 const clean=city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(clean==='cm-yaounde'||/(^|[^a-z])yaounde([^a-z]|$)/.test(clean))
  return BOOTSTRAP_CITIES[0];
 if(clean==='cm-douala'||/(^|[^a-z])douala([^a-z]|$)/.test(clean))
  return BOOTSTRAP_CITIES[1];
 return null;
}
