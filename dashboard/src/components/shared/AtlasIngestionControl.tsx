import React, { useState } from 'react';
import { DatabaseZap, MapPinned, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const CELLS = [
  { key: 'central', label: 'Central Yaoundé' },
  { key: 'west', label: 'West Yaoundé' },
  { key: 'east', label: 'East Yaoundé' },
  { key: 'north', label: 'North Yaoundé' },
  { key: 'south', label: 'South Yaoundé' },
] as const;

type Result = {
  batch_id?: string;
  cell?: string;
  dataset_version?: string;
  input_way_count?: number;
  processed_way_count?: number;
  accepted_count?: number;
  rejected_count?: number;
  status?: string;
  note?: string;
  error?: string;
};

export function AtlasIngestionControl() {
  const [cell, setCell] = useState('central');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('afat-osm-yaounde-ingest', {
      body: { cell },
    });
    setRunning(false);
    if (error) {
      setResult({ error: error.message || 'Atlas ingestion failed.' });
      return;
    }
    setResult((data || {}) as Result);
  };

  return <section className="mb-5 rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.04] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-emerald-200"><DatabaseZap className="h-4 w-4" /><p className="text-[9px] font-black uppercase tracking-[0.22em]">Atlas source ingestion</p></div>
        <h2 className="mt-2 text-lg font-black">OpenStreetMap → AFAT source ledger</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">Planner/Admin only. Imports bounded Yaoundé road cells as ODbL-attributed candidate source records. It does not promote OSM directly into canonical AFAT Atlas.</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-black/20 px-3 py-2 text-[9px] font-bold text-emerald-100/70"><ShieldCheck className="h-3.5 w-3.5" /> JWT + server role gate</div>
    </div>

    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1"><span className="text-[9px] font-black uppercase text-white/35">Yaoundé ingestion cell</span><select value={cell} onChange={(event) => setCell(event.target.value)} disabled={running} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none">{CELLS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" onClick={() => void run()} disabled={running} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400 px-4 text-[10px] font-black uppercase tracking-wide text-slate-950 disabled:opacity-40">{running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}{running ? 'Ingesting…' : 'Ingest road cell'}</button>
    </div>

    {result && <div className={`mt-4 rounded-xl border p-4 ${result.error ? 'border-red-400/20 bg-red-500/10' : 'border-emerald-300/15 bg-black/20'}`}>
      {result.error ? <p className="text-xs font-bold text-red-100">{result.error}</p> : <>
        <div className="grid gap-3 sm:grid-cols-4"><div><p className="text-[8px] font-black uppercase text-white/30">Status</p><p className="mt-1 text-xs font-black text-emerald-100">{result.status || 'completed'}</p></div><div><p className="text-[8px] font-black uppercase text-white/30">Processed</p><p className="mt-1 text-xs font-black">{result.processed_way_count ?? 0}</p></div><div><p className="text-[8px] font-black uppercase text-white/30">Accepted</p><p className="mt-1 text-xs font-black">{result.accepted_count ?? 0}</p></div><div><p className="text-[8px] font-black uppercase text-white/30">Rejected</p><p className="mt-1 text-xs font-black">{result.rejected_count ?? 0}</p></div></div>
        <p className="mt-3 break-all text-[9px] text-white/35">Batch {result.batch_id || 'unavailable'} · {result.dataset_version || 'dataset version unavailable'}</p>
        {result.note && <p className="mt-2 text-[10px] leading-5 text-white/40">{result.note}</p>}
      </>}
    </div>}
  </section>;
}

export default AtlasIngestionControl;
