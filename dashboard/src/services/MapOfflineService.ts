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
  },
  {
    id: 'cameroon',
    name: 'Cameroon Corridor Seed',
    bounds: [[1.6, 8.3], [13.1, 16.2]],
    assetUrls: ['/data/cmr_roads_mock.geojson'],
    sizeMb: 4,
    status: 'ready',
    detail: 'National corridor starter graph',
    coverage: 'Intercity seed network',
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

    this.downloadedRegions.forEach((region) => {
      localStorage.setItem(`${REGION_FLAG_PREFIX}${region.id}`, 'true');
    });
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

  private async verifyPackAssets(assetUrls: string[]) {
    for (const assetUrl of assetUrls) {
      const response = await fetch(assetUrl, { method: 'GET', cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Offline asset missing: ${assetUrl}`);
      }
    }
  }

  public async checkPosition(lat: number, lng: number, onMessage: (msg: string) => void) {
    if (this.isFirstTime) {
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
    if (this.downloadedRegions.some((entry) => entry.id === regionId)) {
      onProgress?.(100);
      return;
    }

    onProgress?.(15);
    await this.verifyPackAssets(region.assetUrls);
    onProgress?.(65);
    await new Promise((resolve) => setTimeout(resolve, 300));
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
