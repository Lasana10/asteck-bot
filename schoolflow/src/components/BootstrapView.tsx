import { type FormEvent, useMemo, useState } from "react";
import { Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import type { BootstrapPayload, BootstrapStatus } from "../domain/types";
import { derivePrefix, normalizeSlug } from "../domain/rules";

export default function BootstrapView({ status, onBootstrap }:{status:BootstrapStatus;onBootstrap:(payload:BootstrapPayload)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [schoolName,setSchoolName]=useState("");
  const [subsystem,setSubsystem]=useState<BootstrapPayload["subsystem"]>("bilingual");
  const slug = useMemo(()=>normalizeSlug(schoolName),[schoolName]);
  const shortName = useMemo(()=>derivePrefix(schoolName,"DRM"),[schoolName]);
  const receiptPrefix = useMemo(()=>`${derivePrefix(schoolName,"DRM")}R`,[schoolName]);
  const studentPrefix = useMemo(()=>`${derivePrefix(schoolName,"DRM")}-26`,[schoolName]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Creating the first protected DREEM school...");
    try{
      await onBootstrap({
        schoolName,
        schoolSlug: slug,
        shortName,
        motto: String(new FormData(event.currentTarget).get("motto") ?? ""),
        city: String(new FormData(event.currentTarget).get("city") ?? ""),
        subsystem,
        receiptPrefix,
        studentIdPrefix: studentPrefix,
        primaryColor: "#123b2c",
        accentColor: "#c9df83",
      });
      setMessage("Founder bootstrap completed. Loading your school workspace...");
    }catch(reason){
      setMessage(reason instanceof Error ? reason.message : "The founder bootstrap could not be completed.");
    }finally{
      setBusy(false);
    }
  }

  if (status.mode === "pending" || status.mode === "rejected" || status.mode === "claimed" || status.mode === "restricted") {
    const body = status.mode === "claimed"
      ? "The first DREEM school has already been claimed. Ask an approved founder or school owner to invite this account."
      : status.mode === "pending"
        ? "Your membership exists but still needs approval before the operational workspace can open."
        : status.mode === "rejected"
          ? "This account was reviewed and is not approved for school access yet."
          : "Bootstrap is locked for this account.";
    return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><h1>Access not ready yet</h1><p>{body}</p><div className="form-status success"><ShieldCheck/>{status.role ? `${status.role} · ${status.status}` : "Protected onboarding state"}</div></div></div>;
  }

  return <div className="auth-screen"><form className="auth-card" onSubmit={submit}><strong>DREEM</strong><h1>Create the first school</h1><p>This founder bootstrap creates the school, approves the founder membership, and unlocks protected configuration.</p><label>School name<input value={schoolName} onChange={event=>setSchoolName(event.target.value)} required placeholder="Graceland Bilingual Complex"/></label><label>Motto<input name="motto" placeholder="Discipline · Wisdom · Service"/></label><label>City<input name="city" placeholder="Douala or Yaounde" required/></label><label>Subsystem<select value={subsystem} onChange={event=>setSubsystem(event.target.value as BootstrapPayload["subsystem"])}><option value="bilingual">Bilingual</option><option value="anglophone">Anglophone</option><option value="francophone">Francophone</option></select></label><div className="form-grid"><label>School slug<input value={slug} readOnly/></label><label>Short name<input value={shortName} readOnly/></label><label>Receipt prefix<input value={receiptPrefix} readOnly/></label><label>Student ID prefix<input value={studentPrefix} readOnly/></label></div>{message&&<div className="form-status success"><Building2/>{message}</div>}<button type="submit" disabled={busy||!schoolName.trim()}>{busy?"Creating school...":"Create founder school"}</button><small style={{display:"block",marginTop:12,color:"#68776f"}}><CheckCircle2 size={14} style={{verticalAlign:"middle",marginRight:6}}/>The first school can only be created once. Future staff and guardians join by invitation.</small></form></div>;
}
