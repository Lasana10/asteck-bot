import { supabase } from '../supabaseClient';

type Bounds = [[number, number], [number, number]];

export interface MapPackDefinition {
  id: 'yaounde' | 'douala' | 'cameroon';
  name: string;
  bounds: Bounds;
  assetUrls: string[];
  sizeMb: number;
  status: 'ready' | 'planned';
  detail: string;
  coverage: string;
  prepStage: 'seeded' | 'surveying' | 'curating' | 'planned';
  collectorRoles: string[];
  targetSignals: string[];
}

interface DownloadedRegion {
  id: string;
  lastAccessed: number;
}

interface IntelligenceData {
  id: string;
  timestamp: number;
  payload: any;
  isSynced: boolean;
}

const STORAGE_KEY = 'afat_offline_maps_v2';
const HYBRID_MODE_KEY = 'afat_hybrid_stream_mode';
const REGION_FLAG_PREFIX = 'afat_offline_';
const OFFLINE_ASSET_CACHE = 'afat-offline-road-assets-v1';

const MAP_PACKS: MapPackDefinition[] = [
  {
    id: 'yaounde',
    name: 'Yaounde Core Grid',
    bounds: [[3.7, 11.4], [4.0, 11.7]],
    assetUrls: ['/data/yaounde_roads.geojson', '/data/yaounde_pois.geojson'],
    sizeMb: 20,
    status: 'ready',
    detail: 'Street graph and POI seed pack',
    coverage: 'Yaounde urban core',
    prepStage: 'seeded',
    collectorRoles: ['commuters', 'drivers', 'checkpoint stewards'],
    targetSignals: ['road shape validation', 'pickup zones', 'high-demand stops'],
  },
  {
    id: 'douala',
    name: 'Douala Grid',
    bounds: [[3.9, 9.5], [4.2, 9.9]],
    assetUrls: [],
    sizeMb: 0,
    status: 'planned',
    detail: 'Awaiting first AFAT-curated offline extract',
    coverage: 'Douala launch pack',
    prepStage: 'surveying',
    collectorRoles: ['commuters', 'taxi operators', 'fleet coordinators'],
    targetSignals: ['boarding clusters', 'shortcut corridors', 'hazard hotspots'],
  },
  {
    id: 'cameroon',
    name: 'Cameroon Corridor Seed',
    bounds: [[1.6, 8.3], [13.1, 16.2]],
    assetUrls: [],
    sizeMb: 0,
    status: 'planned',
    detail: 'Demonstration network is not a verified downloadable navigation pack',
    coverage: 'Intercity seed network',
    prepStage: 'planned',
    collectorRoles: ['intercity commuters', 'bus operators', 'agency planners'],
    targetSignals: ['corridor timing', 'rest stops', 'border and checkpoint friction'],
  },
];

class MapOfflineService {
  private downloadedRegions: DownloadedRegion[] = [];
  private localIntelligence: IntelligenceData[] = [];
  private isFirstTime = true;
  private storageLimitMb = 512;
  private hybridStreamMode = true;

  constructor() {
    this.loadState();
    void this.reconcileInstalledAssets().catch((error) => console.warn('[OfflineMap] Asset verification failed', error));
  }

  private async reconcileInstalledAssets() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    if (typeof caches === 'undefined') { this.downloadedRegions = []; this.saveState(); return; }
    const cache = await caches.open(OFFLINE_ASSET_CACHE);
    const valid: DownloadedRegion[] = [];
    for (const region of this.downloadedRegions) {
      const pack = this.getPack(region.id);
      if (!pack || pack.status !== 'ready' || !pack.assetUrls.length) continue;
      const stored = await Promise.all(pack.assetUrls.map((url) => cache.match(new URL(url, window.location.origin).toString())));
      if (stored.every((response) => response?.ok)) valid.push(region);
    }
    this.downloadedRegions = valid;
    MAP_PACKS.forEach((pack) => localStorage.removeItem(`${REGION_FLAG_PREFIX}${pack.id}`));
    valid.forEach((region) => localStorage.setItem(`${REGION_FLAG_PREFIX}${region.id}`, 'true'));
    this.saveState();
  }

  private loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const downloaded = Array.isArray(parsed?.downloaded) ? parsed.downloaded : [];
        this.downloadedRegions = downloaded
          .map((entry: any) =>
            typeof entry === 'string'
              ? { id: entry, lastAccessed: Date.now() }
              : entry?.id
                ? { id: entry.id, lastAccessed: entry.lastAccessed || Date.now() }
                : null
          )
          .filter(Boolean) as DownloadedRegion[];
        this.isFirstTime = !parsed?.notFirstTime;
      } catch (error) {
        console.warn('[OfflineMap] Failed to load offline state', error);
      }
    }

    const hybridMode = localStorage.getItem(HYBRID_MODE_KEY);
    if (hybridMode !== null) {
      this.hybridStreamMode = hybridMode === 'true';
    }

    // Legacy downloaded flags are not proof of installed assets. Reconciliation
    // confirms availability on startup before declaring any pack usable.
  }

  private saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        downloaded: this.downloadedRegions,
        notFirstTime: !this.isFirstTime,
      })
    );
  }

  private markRegionInstalled(regionId: string) {
    const existing = this.downloadedRegions.find((region) => region.id === regionId);
    if (existing) {
      existing.lastAccessed = Date.now();
    } else {
      this.downloadedRegions.push({ id: regionId, lastAccessed: Date.now() });
    }
    localStorage.setItem(`${REGION_FLAG_PREFIX}${regionId}`, 'true');
    this.saveState();
  }

  private getPack(regionId: string) {
    return MAP_PACKS.find((pack) => pack.id === regionId);
  }

  public getCatalog() {
    return MAP_PACKS.map((pack) => ({
      ...pack,
      installed: this.downloadedRegions.some((region) => region.id === pack.id),
    }));
  }

  public getPreparationBoard() {
    return MAP_PACKS.map((pack) => ({
      id: pack.id,
      name: pack.name,
      prepStage: pack.prepStage,
      coverage: pack.coverage,
      collectorRoles: pack.collectorRoles,
      targetSignals: pack.targetSignals,
      latitude: (pack.bounds[0][0] + pack.bounds[1][0]) / 2,
      longitude: (pack.bounds[0][1] + pack.bounds[1][1]) / 2,
      readyForOffline: pack.status === 'ready',
    }));
  }

  public getHybridStreamMode() {
    return this.hybridStreamMode;
  }

  public getStorageUsage() {
    const used = this.downloadedRegions.reduce((acc, curr) => {
      const region = this.getPack(curr.id);
      return acc + (region?.sizeMb || 0);
    }, 0);
    return {
      used,
      limit: this.storageLimitMb,
      percent: this.storageLimitMb ? Math.round((used / this.storageLimitMb) * 100) : 0,
    };
  }

  private async enforceStorageLimit() {
    const { used } = this.getStorageUsage();
    if (used <= this.storageLimitMb) return;

    this.downloadedRegions.sort((a, b) => a.lastAccessed - b.lastAccessed);
    const purged = this.downloadedRegions.shift();
    if (purged?.id) {
      localStorage.removeItem(`${REGION_FLAG_PREFIX}${purged.id}`);
    }
    this.saveState();
    await this.enforceStorageLimit();
  }

  // Storing a downloaded-region flag is not enough. Install files into
  // persistent CacheStorage, and only declare a pack available after every
  // required asset has been cached and verified.
  private async cacheRegionAssets(assetUrls: string[], onProgress?: (progress: number) => void) {
    if (typeof caches === 'undefined') throw new Error('Offline asset storage is unavailable on this device.');
    const cache = await caches.open(OFFLINE_ASSET_CACHE);
    const staged: string[] = [];
    try {
      for (const [index, assetUrl] of assetUrls.entries()) {
        const absolute = new URL(assetUrl, window.location.origin);
        if (absolute.origin !== window.location.origin) throw new Error('Offline pack asset must be same-origin.');
        const existing = await cache.match(absolute.toString());
        if (!existing?.ok) {
          const response = await fetch(absolute.toString(), { cache: 'no-store' });
          if (!response.ok || response.type === 'opaque') throw new Error(`Offline asset missing: ${assetUrl}`);
          // Avoid caching an SPA HTML fallback disguised as GeoJSON.
          if (assetUrl.endsWith('.geojson')) {
            const parsed = await response.clone().json().catch(() => null);
            if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
              throw new Error(`Invalid GeoJSON in offline asset: ${assetUrl}`);
            }
          }
          await cache.put(absolute.toString(), response);
          staged.push(absolute.toString());
        }
        onProgress?.(15 + Math.round(((index + 1) / assetUrls.length) * 75));
      }
      const verified = await Promise.all(assetUrls.map((url) => cache.match(new URL(url, window.location.origin).toString())));
      if (verified.some((response) => !response?.ok)) throw new Error('Offline assets failed installation verification.');
    } catch (error) {
      for (const url of staged) await cache.delete(url);
      throw error;
    }
  }

  // Read actual preinstalled assets without requiring the network.
  public async readOfflineAsset(regionId: MapPackDefinition['id'], assetUrl: string): Promise<Response | null> {
    const pack = this.getPack(regionId);
    if (!pack || !pack.assetUrls.includes(assetUrl) || typeof caches === 'undefined') return null;
    const cached = await (await caches.open(OFFLINE_ASSET_CACHE)).match(new URL(assetUrl, window.location.origin).toString());
    return cached?.ok ? cached : null;
  }

  public async checkPosition(lat: number, lng: number, onMessage: (msg: string) => void) {
    if (this.isFirstTime && lat >= 3.7 && lat <= 4.0 && lng >= 11.4 && lng <= 11.7) {
      onMessage('AFAT is preparing the first offline pack so your city guidance remains available even with weak connectivity.');
      this.isFirstTime = false;
      this.saveState();
      await this.downloadRegion('yaounde');
    }

    const region = MAP_PACKS.find((pack) =>
      lat >= pack.bounds[0][0] &&
      lat <= pack.bounds[1][0] &&
      lng >= pack.bounds[0][1] &&
      lng <= pack.bounds[1][1]
    );

    if (!region || region.status !== 'ready') return;

    const existing = this.downloadedRegions.find((entry) => entry.id === region.id);
    if (!existing) {
      onMessage(`AFAT is caching the ${region.name} pack for stronger local routing coverage.`);
      await this.downloadRegion(region.id);
      return;
    }

    existing.lastAccessed = Date.now();
    this.saveState();
  }

  public async downloadRegion(regionId: 'yaounde' | 'douala' | 'cameroon', onProgress?: (progress: number) => void) {
    const region = this.getPack(regionId);
    if (!region) {
      throw new Error(`Unknown region: ${regionId}`);
    }
    if (region.status !== 'ready' || region.assetUrls.length === 0) {
      throw new Error(`${region.name} is not yet packaged for offline AFAT use.`);
    }
    // Re-verify/reinstall even when a legacy localStorage flag claims installed.


    onProgress?.(15);
    await this.cacheRegionAssets(region.assetUrls, onProgress);
    this.markRegionInstalled(regionId);
    await this.enforceStorageLimit();
    onProgress?.(100);
  }

  public isRegionAvailable(lat: number, lng: number) {
    const region = MAP_PACKS.find((pack) =>
      lat >= pack.bounds[0][0] &&
      lat <= pack.bounds[1][0] &&
      lng >= pack.bounds[0][1] &&
      lng <= pack.bounds[1][1]
    );
    return region ? this.downloadedRegions.some((entry) => entry.id === region.id) : false;
  }

  public async downloadFullCameroon(onProgress?: (progress: number) => void) {
    await this.downloadRegion('cameroon', onProgress);
  }

  public async clearStorage() {
    await this.offloadIntelligenceToDatabase();
    this.downloadedRegions = [];
    if (typeof caches !== 'undefined') await caches.delete(OFFLINE_ASSET_CACHE);
    MAP_PACKS.forEach((pack) => localStorage.removeItem(`${REGION_FLAG_PREFIX}${pack.id}`));
    this.saveState();
  }

  public async offloadIntelligenceToDatabase() {
    const unSynced = this.localIntelligence.filter((item) => !item.isSynced);
    if (unSynced.length === 0) return;

    const { error } = await supabase
      .from('intelligence_logs')
      .insert(unSynced.map((item) => ({ ...item.payload, synced_at: new Date().toISOString() })));

    if (!error) {
      this.localIntelligence = [];
    }
  }

  public setHybridStreamMode(enabled: boolean) {
    this.hybridStreamMode = enabled;
    localStorage.setItem(HYBRID_MODE_KEY, String(enabled));
  }
}

export const mapOfflineService = new MapOfflineService();
