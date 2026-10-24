import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const ui=readFileSync('dashboard/src/components/shared/EarthObservationDiscovery.tsx','utf8');
const parent=readFileSync('dashboard/src/components/shared/CitySourcePlanPanel.tsx','utf8');
for(const x of ['afat-copernicus-scene-discovery','afat-landsat-scene-discovery','afat-deafrica-discovery',"data?.city_key!==cityKey",'validBounds(bounds)','automatic','No flood, closure or route truth was inferred','cloud_cover'])assert.ok(ui.includes(x),x);
assert.ok(parent.includes('<EarthObservationDiscovery cityKey={cityKey} bounds={data.bounds||null}/>'));
assert.ok(!ui.includes("supabase.from('afat_environment_signals').insert"));
assert.ok(!ui.includes("supabase.rpc('afat_register_environment_signal'"));
console.log('PASS AFAT multi-provider Earth scene discovery reuses existing authenticated adapters without declaring satellite metadata road truth');
