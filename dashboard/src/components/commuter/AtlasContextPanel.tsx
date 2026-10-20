import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LocateFixed, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchAtlasNearby, type AtlasNearbyResponse } from '../../services/atlasClient';
import { explainReviewedAtlas, type AtlasExplanation } from '../../services/atlasExplainClient';
import {reviewedAtlasItems,provisionalAtlasItems,atlasKnowledgeHeadline} from '../../services/atlasKnowledgeTrust';

type Props = {
  city?: string;
  selectedOrigin?: {latitude:number;longitude:number;label?:string};
  onOriginResolved?: (origin: { latitude: number; longitude: number; accuracy?: number; label: string }) => void;
};

const CITY_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  yaounde: { latitude: 3.848, longitude: 11.5021 },
  douala: { latitude: 4.0511, longitude: 9.7679 },
};

export function AtlasContextPanel({ city = 'yaounde', selectedOrigin, onOriginResolved }: Props) {
  const fallback = CITY_CENTERS[String(city).toLowerCase()] || CITY_CENTERS.yaounde;
  const [origin, setOrigin] = useState(fallback);
  const [originLabel, setOriginLabel] = useState(`${city} area`);
  const [atlas, setAtlas] = useState<AtlasNearbyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationPending, setLocationPending] = useState(false);
  const [explainBusy,setExplainBusy]=useState(false);
  const [explanation,setExplanation]=useState<AtlasExplanation|null>(null);
  const [explainQuestion,setExplainQuestion]=useState('overview');

  const loadAtlas = async (point = origin) => {
    setLoading(true);
    setError('');
    setExplanation(null);
    try {
      const graph = await fetchAtlasNearby({ latitude: point.latitude, longitude: point.longitude, radiusM: 3000, limit: 140 });
      setAtlas(graph);
    } catch (err: any) {
      setError(err?.message || 'AFAT could not check route knowledge around this area.');
      setAtlas(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const next = selectedOrigin || CITY_CENTERS[String(city).toLowerCase()] || CITY_CENTERS.yaounde;
    setOrigin({latitude:next.latitude,longitude:next.longitude});
    setOriginLabel(selectedOrigin?.label || `${city} area`);
    void loadAtlas(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city,selectedOrigin?.latitude,selectedOrigin?.longitude,selectedOrigin?.label]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available on this device. You can still continue by landmark.');
      return;
    }
    setLocationPending(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setOrigin(next);
        setOriginLabel(`your position · ±${Math.round(position.coords.accuracy)} m`);
        setLocationPending(false);
        onOriginResolved?.({ ...next, accuracy: position.coords.accuracy, label: `Current position · ±${Math.round(position.coords.accuracy)} m` });
        loadAtlas(next);
      },
      () => {
        setLocationPending(false);
        setError('AFAT could not get a reliable current position. Search by landmark or choose a meeting point instead.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const requestExplanation=async()=>{
    setExplainBusy(true);
    try{setExplanation(await explainReviewedAtlas({latitude:origin.latitude,longitude:origin.longitude,question:explainQuestion}));}
    catch(e:any){setExplanation({status:'ai_unavailable',message:e?.message||'Atlas interpretation unavailable.'});}
    finally{setExplainBusy(false);}
  };

  const reviewedNodes = useMemo(() => reviewedAtlasItems(atlas?.nodes || []), [atlas]);
  const reviewedEdges = useMemo(() => reviewedAtlasItems(atlas?.edges || []), [atlas]);
  const provisionalNodes = useMemo(() => provisionalAtlasItems(atlas?.nodes || []), [atlas]);
  const roadEvidenceNearby = reviewedEdges.length > 0;
  const headline = atlasKnowledgeHeadline(reviewedEdges.length,reviewedNodes.length,provisionalNodes.length);

  return <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${roadEvidenceNearby ? 'bg-blue-500/12 text-blue-300' : 'bg-blue-500/10 text-blue-300'}`}>
          {roadEvidenceNearby ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Around {originLabel}</p>
          <p className="mt-1 text-xs font-bold text-white">{loading ? 'Checking the best local guidance…' : headline}</p>
          <p className="mt-1 text-[10px] leading-4 text-white/40">AFAT will use what is trusted and avoid inventing roads, entrances or shortcuts.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={useMyLocation} disabled={locationPending} className="rounded-xl border border-blue-300/20 bg-blue-500/8 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-blue-100 disabled:opacity-50">
          <LocateFixed className="mr-1 inline h-3.5 w-3.5" />{locationPending ? 'Locating' : 'Use my location'}
        </button>
        <button type="button" onClick={() => loadAtlas()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-white/45 disabled:opacity-50" aria-label="Refresh local route readiness">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>

    {!loading&&!error&&provisionalNodes.length>0&&<div className="mt-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.04] p-3">
      <p className="text-[10px] font-bold text-amber-100/85">Provisional local map knowledge · not independently verified</p>
      <p className="mt-1 text-[10px] leading-4 text-white/45">These are actual Atlas reference records, not proof of entrances, accessible roads or safe movement.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{provisionalNodes.slice(0,5).map(node=><span key={node.id} className="rounded-lg border border-white/10 px-2 py-1 text-[9px] text-white/65">{String(node.canonical_name||node.name||node.node_type||'Unnamed map reference').slice(0,72)}</span>)}</div>
    </div>}

    <div className="mt-3 border-t border-white/10 pt-3">
      <label className="block text-[10px] font-semibold text-white/60">Understand reviewed local knowledge
        <select value={explainQuestion} onChange={e=>setExplainQuestion(e.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-xs text-white"><option value="overview">What is known in this area?</option><option value="access">Known entrances and access</option><option value="roads">Reviewed road knowledge</option></select>
      </label>
      <button type="button" onClick={requestExplanation} disabled={explainBusy||explainQuestion.trim().length<3||loading} className="mt-2 min-h-10 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-[10px] font-black text-cyan-100 disabled:opacity-45">{explainBusy?'Checking reviewed evidence…':'Explain with AFAT intelligence'}</button>
      {explanation&&<div role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
        {explanation.text||explanation.message||'No verified interpretation available.'}
        <p className="mt-2 text-[10px] text-amber-200/65">Advisory only · {explanation.evidence?.length||0} reviewed Atlas references · Not verified routing or live hazard information.</p>
      </div>}
    </div>
    {error && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-500/8 px-3 py-2 text-[10px] font-semibold text-amber-100/75">{error}</div>}
    {!error && !loading && <div className="mt-3 flex items-center gap-2 border-t border-white/7 pt-3 text-[9px] font-semibold text-white/35"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Source checks, confidence and provenance stay behind the scenes.</div>}
  </div>;
}
