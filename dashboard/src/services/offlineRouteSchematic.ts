import type {AfatCanonicalRoute} from './canonicalRouteClient';
import {routeToLatLngs} from './canonicalRouteClient';

export type SchematicPoint={x:number;y:number};
export type SchematicRoute={path:string;start:SchematicPoint;end:SchematicPoint;points:SchematicPoint[]};

export function offlineRouteSchematic(route:AfatCanonicalRoute|null|undefined):SchematicRoute|null{
 const raw=routeToLatLngs(route);
 if(route?.status!=='ok'||raw.length<2||raw.length>50000)return null;
 const valid=raw.every(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180);
 if(!valid)return null;
 const centerLat=raw.reduce((sum,[lat])=>sum+lat,0)/raw.length;
 const lonScale=Math.max(.01,Math.cos(centerLat*Math.PI/180));
 const coords=raw.map(([lat,lon])=>({x:lon*lonScale,y:-lat}));
 const xs=coords.map(p=>p.x),ys=coords.map(p=>p.y);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const dx=maxX-minX,dy=maxY-minY;
 if(dx<1e-10&&dy<1e-10)return null;
 const scale=Math.min(280/Math.max(dx,1e-10),170/Math.max(dy,1e-10));
 const points=coords.map(p=>({x:Number((160+(p.x-(minX+maxX)/2)*scale).toFixed(2)),
  y:Number((105+(p.y-(minY+maxY)/2)*scale).toFixed(2))}));
 // The view is geographic only. No street imagery, road conditions,
 // GPS or traffic are inferred by interpolation.
 const path=points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
 return {path,start:points[0],end:points[points.length-1],points};
}
export function schematicProgressPoint(geometry:SchematicRoute,ratio:number):SchematicPoint{
 const index=Math.max(0,Math.min(geometry.points.length-1,Math.round(Math.max(0,Math.min(1,ratio))*(geometry.points.length-1))));
 return geometry.points[index];
}
