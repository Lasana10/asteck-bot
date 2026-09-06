import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, Database, Layers3, LocateFixed, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { fetchAtlasNearby, type AtlasEdge, type AtlasNearbyResponse, type AtlasNode } from '../../services/atlasClient';

type Props = {
  city?: string;
  onOriginResolved?: (origin: { latitude: number; longitude: number; label: string }) => void;
};

const CITY_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  yaounde: { latitude: 3.848, longitude: 11.5021 },
  douala: { latitude: 4.0511, longitude: 9.7679 },
};

export function AtlasContextPanel({ city = 'yaounde', onOriginResolved }: Props) {
  const fallback = CITY_CENTERS[String(city).toLowerCase()] || CITY_CENTERS.yaounde;
  const [origin, setOrigin] = useState(fallback);
  const [originLabel, setOriginLabel] = useState(`${city} reference area`);
  const [atlas, setAtlas] = useState<AtlasNearbyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationPending, setLocationPending] = useState(false);

  const loadAtlas = async (point = origin) => {
    setLoading(true);
    setError('');
    try {
      const graph = await fetchAtlasNearby({
        latitude: point.latitude,
        longitude: point.longitude,
        radiusM: 3000,
        limit: 140,
      });
      setAtlas(graph);
    } catch (err: any) {
      setError(err?.message || 'AFAT Atlas could not load nearby verified geography.');
      setAtlas(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const next = CITY_CENTERS[String(city).toLowerCase()] || CITY_CENTERS.yaounde;
    setOrigin(next);
    setOriginLabel(`${city} reference area`);
    loadAtlas(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('This device does not expose browser geolocation.');
      return;
    }
    setLocationPending(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setOrigin(next);
        setOriginLabel('Your current location');
        setLocationPending(false);
        onOriginResolved?.({ ...next, label: 'Current location' });
        loadAtlas(next);
      },
      () => {
        setLocationPending(false);
        setError('AFAT could not read your current location. You can continue with the city reference area.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const verifiedNodes = useMemo(() => (atlas?.nodes || []).filter((node: AtlasNode) =>
    ['verified', 'corroborated'].includes(String(node.evidence_status || '').toLowerCase()) || Number(node.confidence || 0) >= 60
  ), [atlas]);

  const verifiedEdges = useMemo(() => (atlas?.edges || []).filter((edge: AtlasEdge) =>
    ['verified', 'corroborated'].includes(String(edge.evidence_status || '').toLowerCase()) || Number(edge.confidence || 0) >= 60
  ), [atlas]);

  const sourceSummary = useMemo(() => {
    const sources = new Set<string>();
    [...verifiedNodes, ...verifiedEdges].forEach((item: any) => {
      if (item.source_key) sources.add(String(item.source_key));
    });
    return Array.from(sources);
  }, [verifiedNodes, verifiedEdges]);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.05]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">
            <Layers3 className="h-4 w-4" /> AFAT Atlas live context
          </div>
          <p className="mt-1 text-[11px] font-semibold text-white/45">Verified/corroborated graph around {originLabel}. Unverified source records are not shown as routable truth.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={useMyLocation} disabled={locationPending} className="rounded-xl border border-cyan-400/20 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-100 disabled:opacity-50">
            <LocateFixed className="mr-1 inline h-3.5 w-3.5" /> {locationPending ? 'Locating' : 'Use my location'}
          </button>
          <button onClick={() => loadAtlas()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/55 disabled:opacity-50">
            <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-4 text-[11px] font-semibold text-amber-200/80">{error}</div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <Crosshair className="h-4 w-4 text-cyan-300" />
            <p className="mt-2 text-lg font-black text-white">{verifiedNodes.length}</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-white/35">Trusted nodes</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <Route className="h-4 w-4 text-emerald-300" />
            <p className="mt-2 text-lg font-black text-white">{verifiedEdges.length}</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-white/35">Routable edges</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <Database className="h-4 w-4 text-violet-300" />
            <p className="mt-2 text-lg font-black text-white">{sourceSummary.length}</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-white/35">Evidence sources</p>
          </div>
        </div>
      )}

      {!loading && !error && verifiedNodes.length === 0 && verifiedEdges.length === 0 && (
        <div className="flex items-start gap-3 border-t border-white/8 px-4 py-3 text-[11px] leading-relaxed text-white/45">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          Atlas has no verified routable graph in this radius yet. AFAT is intentionally showing an empty trusted layer instead of fabricated roads; imported OSM/Overture candidates must pass provenance, topology and corroboration first.
        </div>
      )}

      {!!sourceSummary.length && (
        <div className="border-t border-white/8 px-4 py-3 text-[10px] font-semibold text-white/40">
          Sources: {sourceSummary.join(' · ')}
        </div>
      )}
    </div>
  );
}
