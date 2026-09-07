import React, { useEffect, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { fetchAfatSessionProfile, getCurrentUser, getProfile, supabase } from '../../supabaseClient';
import { AtlasIngestionControl } from './AtlasIngestionControl';
import { DispatchWorkspace } from './DispatchWorkspace';

type DispatchRole = 'commuter' | 'operator' | 'planner' | 'admin';

function normalizeRole(role?: string | null): DispatchRole | null {
  const value = String(role || '').trim().toLowerCase();
  if (['commuter', 'passenger', 'user'].includes(value)) return 'commuter';
  if (['operator', 'driver'].includes(value)) return 'operator';
  if (value === 'planner') return 'planner';
  if (value === 'admin') return 'admin';
  return null;
}

export function DispatchPortal() {
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<DispatchRole | null>(null);
  const [open, setOpen] = useState(false);

  const resolveAuthority = async () => {
    const session = await getCurrentUser();
    if (session.user?.id) {
      const result = await getProfile(session.user.id);
      if (result.data) {
        setProfile(result.data);
        setRole(normalizeRole(result.data.role));
        return;
      }
    }

    const backendSession = await fetchAfatSessionProfile();
    const backendProfile = backendSession.data?.profile;
    if (backendProfile?.id) {
      setProfile(backendProfile);
      setRole(normalizeRole(backendProfile.role));
      return;
    }

    setProfile(null);
    setRole(null);
    setOpen(false);
  };

  useEffect(() => {
    void resolveAuthority();
    const { data } = supabase.auth.onAuthStateChange(() => { void resolveAuthority(); });
    const handleStorage = (event: StorageEvent) => {
      if (['afat_user_id','afat_access_token','afat_access_token_user_id'].includes(String(event.key || ''))) void resolveAuthority();
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (!profile?.id || !role) return null;
  const canIngestAtlas = role === 'planner' || role === 'admin';

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-24 right-4 z-[1200] flex min-h-12 items-center gap-2 rounded-full border border-cyan-300/25 bg-[#07131d]/95 px-4 text-[10px] font-black uppercase tracking-wider text-cyan-100 shadow-2xl shadow-black/50 backdrop-blur-xl sm:bottom-7 sm:right-7"
      aria-label="Open AFAT dispatch"
    >
      <Activity className="h-4 w-4 text-cyan-300" /> Dispatch
    </button>

    {open && <div className="fixed inset-0 z-[2000] overflow-y-auto bg-[#02070c]/98 text-white backdrop-blur-xl">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#02070c]/95 px-4 py-4 backdrop-blur-xl sm:px-7">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300/70">AFAT fulfilment command</p>
            <h1 className="mt-1 text-xl font-black">{role === 'commuter' ? 'Passenger journey control' : role === 'operator' ? 'Operator mission control' : role === 'planner' ? 'Planner dispatch control' : 'Admin dispatch oversight'}</h1>
            <p className="mt-1 text-xs text-white/35">Authority resolved from the active AFAT identity · {profile.full_name || profile.email || profile.id.slice(0, 8)}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white" aria-label="Close dispatch"><X className="h-5 w-5" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7">
        {canIngestAtlas && <AtlasIngestionControl />}
        <DispatchWorkspace role={role} profile={profile} />
      </main>
    </div>}
  </>;
}

export default DispatchPortal;
