import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("Signing in…");
    const values = new FormData(event.currentTarget);
    const { error } = await supabase!.auth.signInWithPassword({ email:String(values.get("email")), password:String(values.get("password")) });
    setMessage(error ? error.message : "Signed in.");
  }

  if (!ready) return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><p>Securing your school workspace…</p></div></div>;
  if (!isSupabaseConfigured) return <>{children}<div className="demo-banner">Demo workspace · connect Supabase before using real school records</div></>;
  if (!session) return <div className="auth-screen"><form className="auth-card" onSubmit={signIn}><span>D</span><strong>DREEM</strong><h1>Enter your school workspace</h1><p>Use the staff, parent or learner account issued by your school.</p><label>Email<input type="email" name="email" required autoComplete="email" /></label><label>Password<input type="password" name="password" required autoComplete="current-password" /></label>{message && <small>{message}</small>}<button type="submit">Sign in securely</button></form></div>;
  return <>{children}</>;
}
