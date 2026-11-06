import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

const roadData = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[11.5, 3.86], [11.51, 3.87]] }, properties: {} }] };

function setupStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const assets = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => assets.get(url)?.clone()),
    put: vi.fn(async (url: string, value: Response) => { assets.set(url, value.clone()); }),
    delete: vi.fn(async (url: string) => assets.delete(url)),
  };
  const caches = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => { assets.clear(); return true; }),
  };
  vi.stubGlobal('window', { location: { origin: 'https://afat.example.test' } });
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
    url.includes('roads') ? roadData : { type: 'FeatureCollection', features: [] },
  ), { status: 200, headers: { 'content-type': 'application/json' } })));
  return { values, assets, cache, caches };
}

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

describe('AFAT real offline asset installation', () => {
  it('does not treat a downloaded flag as actual offline storage', async () => {
    const { values } = setupStorage();
    values.set('afat_offline_maps_v2', JSON.stringify({ downloaded: ['yaounde'], notFirstTime: true }));
    const { mapOfflineService } = await import('./MapOfflineService');
    await vi.waitFor(() => {
      expect(mapOfflineService.getCatalog().find(p => p.id === 'yaounde')?.installed).toBe(false);
    });
  });

  it('stores actual road/POI responses for disconnected use', async () => {
    const { assets } = setupStorage();
    const { mapOfflineService } = await import('./MapOfflineService');
    await mapOfflineService.downloadRegion('yaounde');
    expect(mapOfflineService.isRegionAvailable(3.866, 11.516)).toBe(true);
    const road = await mapOfflineService.readOfflineAsset('yaounde', '/data/yaounde_roads.geojson');
    expect((await road?.json())?.type).toBe('FeatureCollection');
    expect(assets.size).toBe(2);
  });

  it('shows installed source geometry to the real map, never a network fallback', async () => {
    const { assets } = setupStorage();
    const { mapOfflineService } = await import('./MapOfflineService');
    expect(await mapOfflineService.readVerifiedYaoundeSeed()).toBeNull();
    await mapOfflineService.downloadRegion('yaounde');
    const seed = await mapOfflineService.readVerifiedYaoundeSeed();
    expect(seed?.roads.features).toHaveLength(1);
    expect(seed?.roads.features[0].properties).toEqual({
      name:'AFAT offline seed',source_only:true,review_status:'seed_unverified',kind:'road_seed',
    });
    expect(seed?.places.features).toHaveLength(0);
    assets.clear();
    expect(await mapOfflineService.readVerifiedYaoundeSeed()).toBeNull();
  });

  it('reports real cached bytes instead of the nominal 20 MB Yaoundé estimate', async()=>{
    setupStorage();
    const {mapOfflineService}=await import('./MapOfflineService');
    await mapOfflineService.downloadRegion('yaounde');
    const usage=mapOfflineService.getStorageUsage();
    expect(usage.used).toBeGreaterThan(0);
    expect(usage.used).toBeLessThan(1);
    expect(mapOfflineService.getCatalog().find(p=>p.id==='yaounde')?.installed).toBe(true);
  });

  it('physically deletes cached files and flags when the real storage budget is exceeded', async()=>{
    const {assets,values}=setupStorage();
    const {mapOfflineService}=await import('./MapOfflineService');
    // Explicitly force tiny test quota; no actual user quota is changed.
    (mapOfflineService as any).storageLimitMb=0.000001;
    await mapOfflineService.downloadRegion('yaounde');
    expect(mapOfflineService.getCatalog().find(p=>p.id==='yaounde')?.installed).toBe(false);
    expect(mapOfflineService.getStorageUsage().used).toBe(0);
    expect(assets.size).toBe(0);
    expect(values.get('afat_offline_yaounde')).toBeUndefined();
    expect(await mapOfflineService.readOfflineAsset('yaounde','/data/yaounde_roads.geojson')).toBeNull();
  });

  it('rehydrates actual storage size from CacheStorage during reload, not legacy flags', async()=>{
    setupStorage();
    const previous=(await import('./MapOfflineService')).mapOfflineService;
    await previous.downloadRegion('yaounde');
    const used=previous.getStorageUsage().used;
    vi.resetModules();
    vi.mock('../supabaseClient',()=>({supabase:{}}));
    const fresh=(await import('./MapOfflineService')).mapOfflineService;
    await vi.waitFor(()=>expect(fresh.getStorageUsage().used).toBeCloseTo(used,8));
    expect(fresh.getCatalog().find(p=>p.id==='yaounde')?.installed).toBe(true);
  });

  it('rejects a simulated national pack as genuine offline coverage', async () => {
    setupStorage();
    const { mapOfflineService } = await import('./MapOfflineService');
    expect(mapOfflineService.getCatalog().find(p => p.id === 'cameroon')?.status).toBe('planned');
    await expect(mapOfflineService.downloadFullCameroon()).rejects.toThrow('not yet packaged');
  });
});
