import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPinned, Play, RefreshCw, Rows3, Square } from 'lucide-react';
import { fetchCityExpansionCells, runCityExpansionBatch, runNextCityExpansionCell, seedCityExpansion } from '../../services/cityExpansionClient';

export function CityExpansionRunner({ cityKey = 'cm-yaounde' }: { cityKey?: string }) {
  const [bbox, setBbox] = useState({ south: '', west: '', north: '', east: '', span: '0.02' });
  const [cells, setCells] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [waveProgress, setWaveProgress] = useState({ processed: 0, target: 0 });
  const stopRequested = useRef(false);

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
  const pending = Number(counts.pending || 0) + Number(counts.failed || 0);

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

  const runBatch = async (size = 12) => {
    setBusy(true);
    const { data, error } = await runCityExpansionBatch(cityKey, size);
    setBusy(false);
    const completed = (data || []).filter((item: any) => item && item.status !== 'empty').length;
    setNotice(error ? `${completed} cell(s) processed before: ${error.message}` : `${completed} cell(s) processed in this controlled batch.`);
    await load();
  };

  const runWave = async () => {
    const target = Math.min(48, Math.max(0, pending));
    if (!target) { setNotice('No pending or failed ingestion cell remains.'); return; }
    stopRequested.current = false;
    setBusy(true);
    setWaveProgress({ processed: 0, target });
    let processed = 0;
    let terminalMessage = '';

    while (processed < target && !stopRequested.current) {
      const remaining = target - processed;
      const { data, error } = await runCityExpansionBatch(cityKey, Math.min(12, remaining));
      const completed = (data || []).filter((item: any) => item && item.status !== 'empty').length;
      processed += completed;
      setWaveProgress({ processed, target });
      await load();
      if (error) { terminalMessage = `${processed} cell(s) processed before AFAT stopped: ${error.message}`; break; }
      if ((data || []).some((item: any) => item?.status === 'empty') || completed === 0) { terminalMessage = `${processed} cell(s) processed. No queued cell remains.`; break; }
      await new Promise(resolve => window.setTimeout(resolve, 350));
    }

    setBusy(false);
    if (stopRequested.current) setNotice(`Expansion paused safely after ${processed} cell(s). Running cells were allowed to finish.`);
    else setNotice(terminalMessage || `${processed} cell(s) processed in this bounded expansion wave. Run another wave if cells remain.`);
    await load();
  };

  return <section className="mt-5 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.04] p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-emerald-200"/><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">City expansion queue</p></div><h3 className="mt-2 text-lg font-black">Expand the real road graph cell by cell</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">Each queued cell runs through the authenticated OSM ingest function with ODbL provenance. A completed ingest remains candidate/provisional until AFAT evidence rules permit promotion; this screen never turns source data directly into verified truth.</p></div>
      <button onClick={load} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/60 disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}/></button>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {['pending','running','completed','completed_with_errors','failed'].map(status => <div key={status} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-lg font-black">{counts[status] || 0}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-white/35">{status.replace(/_/g,' ')}</p></div>)}
    </div>

    {busy && waveProgress.target > 0 && <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3"><div className="flex items-center justify-between text-[9px] font-black uppercase text-cyan-100"><span>Expansion wave</span><span>{waveProgress.processed} / {waveProgress.target}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-300 transition-all" style={{width:`${Math.min(100,(waveProgress.processed/Math.max(1,waveProgress.target))*100)}%`}}/></div></div>}

    <details className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
      <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wider text-white/45">Seed another approved bbox</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        {(['south','west','north','east'] as const).map(key => <label key={key} className="text-[8px] font-black uppercase tracking-wider text-white/35">{key}<input value={bbox[key]} onChange={event=>setBbox(current=>({...current,[key]:event.target.value}))} inputMode="decimal" placeholder="coordinate" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case tracking-normal text-white outline-none"/></label>)}
        <label className="text-[8px] font-black uppercase tracking-wider text-white/35">Cell span<input value={bbox.span} onChange={event=>setBbox(current=>({...current,span:event.target.value}))} inputMode="decimal" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm normal-case tracking-normal text-white outline-none"/></label>
      </div>
      <button onClick={seed} disabled={busy} className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-[9px] font-black uppercase text-emerald-100 disabled:opacity-35"><Rows3 className="h-3.5 w-3.5"/>Seed bbox</button>
    </details>

    <div className="mt-4 flex flex-wrap gap-2">
      <button onClick={runNext} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-[9px] font-black uppercase text-cyan-100 disabled:opacity-35"><Play className="h-3.5 w-3.5"/>Run next cell</button>
      <button onClick={()=>runBatch(12)} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-[9px] font-black uppercase text-emerald-100 disabled:opacity-35"><Play className="h-3.5 w-3.5"/>Run 12-cell batch</button>
      <button onClick={runWave} disabled={busy || pending===0} className="flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35"><Play className="h-3.5 w-3.5"/>Run up to 48 cells</button>
      {busy && waveProgress.target>0 && <button onClick={()=>{stopRequested.current=true;}} className="flex min-h-10 items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 text-[9px] font-black uppercase text-amber-100"><Square className="h-3.5 w-3.5"/>Pause after current batch</button>}
    </div>
    <p className="mt-3 text-[10px] text-white/35">{pending} pending/failed cell{pending===1?'':'s'} remain. Expansion waves are intentionally bounded so provider errors, auth expiry or network failures stop quickly instead of running blindly.</p>
    {notice && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">{notice}</p>}
  </section>;
}
