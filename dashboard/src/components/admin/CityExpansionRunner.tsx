import React, { useEffect, useMemo, useState } from 'react';
import { MapPinned, Play, RefreshCw, Rows3 } from 'lucide-react';
import { fetchCityExpansionCells, runCityExpansionBatch, runNextCityExpansionCell, seedCityExpansion } from '../../services/cityExpansionClient';

export function CityExpansionRunner({ cityKey = 'cm-yaounde' }: { cityKey?: string }) {
  const [bbox, setBbox] = useState({ south: '', west: '', north: '', east: '', span: '0.02' });
  const [cells, setCells] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    const { data, error } = await fetchCityExpansionCells(cityKey);
    if (error) setNotice(error.message || 'Could not load city expansion cells.');
    else setCells(data);
  };
  useEffect(() => { void load(); }, [cityKey]);

  const counts = useMemo(() => cells.reduce((acc: Record<string, number>, cell) => {
    acc[cell.status] = (acc[cell.status] || 0) + 1;
    return acc;
  }, {}), [cells]);

  const seed = async () => {
    const south = Number(bbox.south), west = Number(bbox.west), north = Number(bbox.north), east = Number(bbox.east), span = Number(bbox.span);
    if (![south, west, north, east, span].every(Number.isFinite) || south >= north || west >= east) {
      setNotice('Enter a valid south / west / north / east expansion box. AFAT will not guess city boundaries.');
      return;
    }
    setBusy(true);
    const { data, error } = await seedCityExpansion({ cityKey, south, west, north, east, cellSpan: span });
    setBusy(false);
    setNotice(error ? error.message : `${data?.cells_created || 0} ingestion cells added to ${cityKey}.`);
    await load();
  };

  const runNext = async () => {
    setBusy(true);
    const { data, error } = await runNextCityExpansionCell(cityKey);
    setBusy(false);
    setNotice(error ? error.message : data?.status === 'empty' ? 'No pending ingestion cell remains.' : `Cell ${data?.cell?.scope_label || ''} finished with ${data?.status || 'result'}.`);
    await load();
  };

  const runBatch = async () => {
    setBusy(true);
    const { data, error } = await runCityExpansionBatch(cityKey, 6);
    setBusy(false);
    const completed = (data || []).filter((item: any) => item && item.status !== 'empty').length;
    setNotice(error ? `${completed} cell(s) processed before: ${error.message}` : `${completed} cell(s) processed in this controlled batch.`);
    await load();
  };

  return <section className="mt-5 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-emerald-200"/><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">City expansion queue</p></div><h3 className="mt-2 text-lg font-black">Expand the real road graph cell by cell</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">Seed only a bbox you intend AFAT to learn. Each cell runs through the authenticated OSM city-ingest function, retains ODbL provenance, prepares topology and remains candidate/provisional until the evidence rules permit promotion.</p></div>
      <button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/60 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}/></button>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {['pending','running','completed','completed_with_errors','failed'].map(status => <div key={status} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-lg font-black">{counts[status] || 0}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{status.replace(/_/g,' ')}</p></div>)}
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-5">
      {(['south','west','north','east'] as const).map(key => <label key={key} className="text-[8px] font-black uppercase tracking-wider text-white/35">{key}<input value={bbox[key]} onChange={event=>setBbox(current=>({...current,[key]:event.target.value}))} inputMode="decimal" placeholder="coordinate" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case tracking-normal text-white outline-none"/></label>)}
      <label className="text-[8px] font-black uppercase tracking-wider text-white/35">Cell span<input value={bbox.span} onChange={event=>setBbox(current=>({...current,span:event.target.value}))} inputMode="decimal" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case tracking-normal text-white outline-none"/></label>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={seed} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-[9px] font-black uppercase text-emerald-100 disabled:opacity-35"><Rows3 className="h-3.5 w-3.5"/>Seed bbox</button>
      <button onClick={runNext} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-35"><Play className="h-3.5 w-3.5"/>Run next cell</button>
      <button onClick={runBatch} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Play className="h-3.5 w-3.5"/>Run 6-cell batch</button>
    </div>
    {notice && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
  </section>;
}
