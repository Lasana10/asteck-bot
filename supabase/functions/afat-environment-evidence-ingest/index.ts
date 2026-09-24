import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
function keyFromJson(name:string,key:string){try{return JSON.parse(Deno.env.get(name)||"{}")[key]||"";}catch{return "";}}
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||keyFromJson("SUPABASE_PUBLISHABLE_KEYS","default");

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

const SIGNALS=new Set(["rainfall","surface_water","flood_hypothesis","land_cover","terrain","settlement_change","remote_change"]);

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"POST required"},405);
  if(!ANON) return json({error:"Supabase publishable key unavailable"},500);

  const auth=req.headers.get("authorization")||"";
  const client=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await client.auth.getUser();
  if(!user) return json({error:"Authenticated AFAT identity required"},401);

  const perms=await Promise.all([
    client.rpc("afat_has_permission",{p_permission_key:"planning.aggregate.view",p_company_id:null}),
    client.rpc("afat_has_permission",{p_permission_key:"map.evidence.review",p_company_id:null}),
    client.rpc("afat_has_permission",{p_permission_key:"system.configure",p_company_id:null}),
  ]);
  if(!perms.some(x=>x.data===true)) return json({error:"Environmental evidence permission required"},403);

  const body=await req.json().catch(()=>({}));
  const cityKey=String(body.city_key||"cm-yaounde").toLowerCase();
  const sourceKey=String(body.source_key||"").trim();
  const signalType=String(body.signal_type||"").trim();
  const latitude=Number(body.latitude);
  const longitude=Number(body.longitude);
  const observedAt=String(body.observed_at||"").trim();
  const expiresAt=body.expires_at?String(body.expires_at):null;
  const severity=Number(body.severity??50);
  const confidence=Number(body.confidence??50);

  if(!sourceKey) return json({error:"source_key required"},400);
  if(!SIGNALS.has(signalType)) return json({error:"Unsupported signal_type"},400);
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180) return json({error:"Valid latitude/longitude required"},400);
  if(!observedAt||Number.isNaN(Date.parse(observedAt))) return json({error:"Valid observed_at required"},400);
  if(!Number.isFinite(severity)||severity<0||severity>100||!Number.isFinite(confidence)||confidence<0||confidence>100) return json({error:"severity/confidence must be 0..100"},400);

  const provenance={
    ...(body.provenance&&typeof body.provenance==="object"?body.provenance:{}),
    gateway:"afat-environment-evidence-ingest",
    submitted_by:user.id,
    submitted_at:new Date().toISOString(),
    automatic_truth:false,
    requires_source_provenance:true,
  };

  const {data,error}=await client.rpc("afat_register_environment_signal",{
    p_city_key:cityKey,
    p_source_key:sourceKey,
    p_signal_type:signalType,
    p_latitude:latitude,
    p_longitude:longitude,
    p_observed_at:observedAt,
    p_expires_at:expiresAt,
    p_severity:severity,
    p_confidence:confidence,
    p_payload:body.payload&&typeof body.payload==="object"?body.payload:{},
    p_provenance:provenance,
  });

  if(error) return json({error:error.message},400);
  return json({signal:data,policy:{automatic_truth:false,derived_observation_required:true}});
});
