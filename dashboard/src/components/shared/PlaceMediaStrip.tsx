import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Camera, ImageOff, ShieldCheck } from 'lucide-react';
import { fetchApprovedPlaceMedia, resolvePlaceMediaUrl, type AfatPlaceMedia } from '../../services/placeMediaClient';

type Props = {
  atlasNodeId: string;
  placeName?: string | null;
  compact?: boolean;
};

export function PlaceMediaStrip({ atlasNodeId, placeName, compact = false }: Props) {
  const [items, setItems] = useState<AfatPlaceMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchApprovedPlaceMedia(atlasNodeId)
      .then((media) => { if (active) setItems(media); })
      .catch((err: any) => { if (active) setError(err?.message || 'Place imagery unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [atlasNodeId]);

  const visible = useMemo(() => items
    .map((item) => ({ item, url: resolvePlaceMediaUrl(item) }))
    .filter((entry): entry is { item: AfatPlaceMedia; url: string } => Boolean(entry.url))
    .slice(0, compact ? 3 : 6), [items, compact]);

  if (loading) return <div className="animate-pulse rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Loading verified place imagery…</div>;
  if (error) return <div className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.05] p-4 text-[11px] text-amber-100/70">{error}</div>;
  if (!visible.length) return compact ? null : (
    <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-white/40">
      <ImageOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div><p className="text-[10px] font-black uppercase tracking-wider">No approved imagery yet</p><p className="mt-1 text-[11px] leading-5">AFAT will not substitute scraped or unreviewed photos for {placeName || 'this place'}.</p></div>
    </div>
  );

  const lead = visible[0];
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
    <div className="relative">
      <img src={lead.url} alt={lead.item.alt_text || placeName || 'AFAT place'} className={`${compact ? 'h-32' : 'h-48 sm:h-56'} w-full object-cover`} loading="lazy" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent px-4 pb-3 pt-10">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-sm font-black text-white">{placeName || lead.item.caption || 'AFAT Place'}</p><p className="mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/55"><ShieldCheck className="h-3 w-3 text-emerald-300" /> Approved imagery · {lead.item.rights_basis.replaceAll('_', ' ')}</p></div>
          <span className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[9px] font-black text-white/70"><Camera className="mr-1 inline h-3 w-3" />{visible.length}</span>
        </div>
      </div>
    </div>
    {visible.length > 1 && <div className="grid grid-cols-3 gap-1 border-t border-white/8 bg-black/30 p-1">
      {visible.slice(1, 4).map(({ item, url }) => <img key={item.id} src={url} alt={item.alt_text || item.caption || 'AFAT place context'} className="h-20 w-full rounded-lg object-cover" loading="lazy" />)}
    </div>}
    {!compact && <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3 text-[9px] text-white/35">
      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Building, entrance and street context can be kept separately.</span>
      {lead.item.attribution_text && <span className="max-w-[48%] truncate text-right">{lead.item.attribution_text}</span>}
    </div>}
  </section>;
}

export default PlaceMediaStrip;
