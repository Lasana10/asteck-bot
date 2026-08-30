import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, FileText, Landmark, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { createPublicPartnerResponse, fetchPublicPartnerConditions } from '../../supabaseClient';

interface Props {
  activeTab?: string;
  membership: any;
  profile: any;
  onSignOut: () => void;
}

const RESPONSE_ACTIONS = {
  capacity: 'Request operator capacity',
  traffic: 'Coordinate traffic control',
  notice: 'Draft public notice',
  stop: 'Propose temporary stop',
};

export function GovernmentDashboard({ activeTab = 'notifications', membership, profile, onSignOut }: Props) {
  const partner = membership?.partner;
  const [notice, setNotice] = useState('');
  const [response, setResponse] = useState({ capacity: true, traffic: false, notice: false, stop: false });
  const [conditions, setConditions] = useState<any>({ incidents: [], vehicles: [], checkpoints: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadConditions = async () => {
    setLoading(true);
    const { data, error } = await fetchPublicPartnerConditions(partner?.jurisdiction || profile?.preferred_city || 'cameroon');
    setLoading(false);
    if (error) {
      setNotice(`Public evidence feed unavailable: ${error.message}`);
      return;
    }
    setConditions(data || { incidents: [], vehicles: [], checkpoints: [] });
  };

  useEffect(() => {
    void loadConditions();
  }, [partner?.jurisdiction, profile?.preferred_city]);

  const selectedActions = useMemo(
    () => Object.entries(response).filter(([, selected]) => selected).map(([key]) => RESPONSE_ACTIONS[key as keyof typeof RESPONSE_ACTIONS]),
    [response],
  );
  const prioritySituation = conditions.incidents?.[0];
  const title = activeTab === 'bookings' ? 'Public mobility evidence' : activeTab === 'profile' ? 'Mandate and access' : 'Coordinated response';

  const submitResponse = async () => {
    if (!profile?.id || !prioritySituation || selectedActions.length === 0) return;
    setSubmitting(true);
    setNotice('');
    const { data, error } = await createPublicPartnerResponse({
      evidence_id: prioritySituation.id,
      requested_actions: selectedActions,
    });
    setSubmitting(false);
    if (error) {
      setNotice(`Response submission failed: ${error.message}`);
      return;
    }
    const reference = String(data?.request?.id || '').slice(0, 8);
    setNotice(`Response ${reference || 'case'} entered AFAT review. No public action is published until an authorized approver confirms it.`);
  };

  return (
    <div className="min-h-screen bg-[#03080e] pb-28 text-white">
      <header className="border-b border-white/10 bg-[#050b12]/95 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3"><Landmark className="h-5 w-5 text-teal-300" /><div><p className="font-black">{partner?.name || 'Public Partner'}</p><p className="text-[9px] font-black uppercase tracking-widest text-teal-300/70">Privacy-safe public coordination</p></div></div>
          <button onClick={onSignOut} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-black text-white/55">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
        <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-teal-300">Public Partner</p><h1 className="mt-2 text-3xl font-black">{title}</h1></div>
        {notice && <p role="status" className={`rounded-lg border p-4 text-sm font-bold ${notice.includes('failed') || notice.includes('unavailable') ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'}`}>{notice}</p>}

        {activeTab === 'notifications' && (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-lg border border-teal-300/15 bg-white/[0.035] p-6">
              <h2 className="text-xl font-black">{prioritySituation ? 'Coordinate validated situation' : 'No validated situation selected'}</h2>
              <p className="mt-2 text-sm text-white/45">{prioritySituation ? `${String(prioritySituation.type || 'movement condition').replace(/_/g, ' ')} · severity ${prioritySituation.severity || 'pending'} · ${prioritySituation.address || 'location protected'}` : 'The response controls unlock only when the mandate-scoped evidence feed returns a validated situation.'}</p>
              <div className="mt-6 space-y-3">
                {Object.entries(RESPONSE_ACTIONS).map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4"><input type="checkbox" checked={response[key as keyof typeof response]} onChange={(event) => setResponse((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 accent-teal-400" /><span className="text-sm font-bold">{label}</span></label>)}
              </div>
              <button onClick={submitResponse} disabled={!prioritySituation || selectedActions.length === 0 || submitting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-400 text-xs font-black text-slate-950 disabled:opacity-35"><Send className="h-4 w-4" /> {submitting ? 'Submitting review case...' : 'Submit coordinated response for review'}</button>
            </section>
            <aside className="rounded-lg border border-white/10 bg-white/[0.035] p-6"><ShieldCheck className="h-6 w-6 text-teal-300" /><h2 className="mt-4 font-black">Approval boundary</h2><p className="mt-2 text-sm leading-relaxed text-white/45">This workspace drafts and requests coordination. A designated public approver must authorize public notices. AFAT Admin permissions remain separate.</p><div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4 text-xs text-white/55">Representative: {profile?.full_name || 'Verified representative'}<br />Scope: {partner?.mandate_scope || 'Mandate review pending'}</div></aside>
          </div>
        )}

        {activeTab === 'bookings' && (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5"><BarChart3 className="h-5 w-5 text-teal-300" /><p className="mt-5 text-3xl font-black">{loading ? '—' : conditions.incidents?.length || 0}</p><p className="mt-1 text-xs text-white/40">Validated conditions</p></div>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-5 text-3xl font-black">{loading ? '—' : conditions.vehicles?.length || 0}</p><p className="mt-1 text-xs text-white/40">Aggregated service signals</p></div>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5"><FileText className="h-5 w-5 text-blue-300" /><button onClick={loadConditions} disabled={loading} className="mt-5 text-left text-base font-black">{loading ? 'Refreshing evidence...' : 'Refresh aggregate evidence'}</button></div>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-teal-300/15 bg-teal-500/10 p-6"><Landmark className="h-6 w-6 text-teal-300" /><h2 className="mt-4 text-xl font-black">{partner?.name || 'Public institution'}</h2><p className="mt-2 text-sm text-white/45">{partner?.jurisdiction || 'Jurisdiction pending'} · {partner?.status || 'under review'}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-6"><LockKeyhole className="h-6 w-6 text-amber-300" /><h2 className="mt-4 text-xl font-black">Scoped representative</h2><p className="mt-2 text-sm leading-relaxed text-white/45">Aggregated analytics and public intervention drafting only. No citizen PII, operator finances, Planner or Admin powers.</p></div>
          </section>
        )}
      </main>
    </div>
  );
}
