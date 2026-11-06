import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map=readFileSync('dashboard/src/components/commuter/PassengerSpatialMap.tsx','utf8');
for(const item of [
 'viewportRequestSequence=useRef(0)',
 'atlasRequestSequence=useRef(0)',
 'const seq=++viewportRequestSequence.current',
 'if(seq!==viewportRequestSequence.current||mapRef.current!==map)return',
 'if(!Array.isArray(data?.places))',
 'cacheSpatialViewport({...request,places:data.places})',
 'setViewPlaces([]);setMapStatus',
 'const seq=++atlasRequestSequence.current',
 'if(seq!==atlasRequestSequence.current)return',
 'if(seq===atlasRequestSequence.current)setAtlasLoading(false)',
 'viewportRequestSequence.current+=1;atlasRequestSequence.current+=1',
]){
 assert.ok(map.includes(item),'race-safe passenger map: '+item);
}
const viewer=map.slice(map.indexOf('const loadPlacesInView='),map.indexOf('const loadAtlas='));
assert.ok(viewer.indexOf('if(seq!==viewportRequestSequence.current')<
 viewer.indexOf('cacheSpatialViewport({...request'),'offline cache must not store outdated viewport response');
assert.ok(viewer.includes('const cached=readCachedPlaces(request)'),'offline failure must be scoped to requested bounds');
const atlas=map.slice(map.indexOf('const loadAtlas='),map.indexOf('useEffect(()=>{const[longitude,latitude]=mapCenter'));
assert.ok(atlas.includes('if(seq!==atlasRequestSequence.current)return'),'latest atlas request owns the rendered graph');
console.log('PASS AFAT viewport and atlas latest-request wins; no stale city map cache');
