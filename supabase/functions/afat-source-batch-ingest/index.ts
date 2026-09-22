import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
function finite(v:unknown){const n=Number(v);return Number.isFinite(n)?n:null;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"POST required"},405);
  if(!ANON||!SERVICE) return json({error:"Supabase keys unavailable"},500);
  const auth=req.headers.get("authorization")||"";
  const user=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const service=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false}});
  const {data:{user:identity}}=await user.auth.getUser();
  if(!identity) return json({error:"Authenticated AFAT identity required"},401);
  const perms=await Promise.all([
    user.rpc("afat_has_permission",{p_permission_key:"map.evidence.review",p_company_id:null}),
    user.rpc("afat_has_permission",{p_permission_key:"system.configure",p_company_id:null})
  ]);
  if(!perms.some(x=>x.data===true)) return json({error:"Map evidence review authority required"},403);

  const body=await req.json().catch(()=>({}));
  const cityKey=String(body.city_key||"").trim().toLowerCase();
  const sourceKey=String(body.source_key||"").trim();
  const datasetVersion=String(body.dataset_version||"").trim();
  const scopeLabel=String(body.scope_label||"batch").trim().slice(0,120);
  const records=Array.isArray(body.records)?body.records:[];
  if(!cityKey||!sourceKey||!datasetVersion) return json({error:"city_key, source_key and dataset_version are required"},400);
  if(records.length<1||records.length>500) return json({error:"records must contain 1..500 normalized features"},400);

  const {data:city}=await service.from("afat_city_profiles").select("id,city_key,city_name").eq("city_key",cityKey).eq("status","active").maybeSingle();
  if(!city) return json({error:"Active AFAT city profile required"},404);
  const {data:source}=await service.from("afat_geo_sources").select("source_key,license_expression,attribution_text,usage_constraints,enabled").eq("source_key",sourceKey).eq("enabled",true).maybeSingle();
  const {data:cap}=await service.from("afat_source_capability_profiles").select("data_mode,durable_storage_allowed,derivative_use_reviewed").eq("source_key",sourceKey).maybeSingle();
  if(!source||!cap) return json({error:"Registered source capability required"},400);
  if(!cap.durable_storage_allowed||!["open_ingest","licensed_ingest","afat_owned"].includes(String(cap.data_mode))){
    return json({error:"This source is not authorized for durable AFAT batch ingestion",data_mode:cap.data_mode},403);
  }

  const b=body.bbox||{};
  const south=finite(b.south),west=finite(b.west),north=finite(b.north),east=finite(b.east);
  if([south,west,north,east].some(v=>v===null)||!(south!<north!&&west!<east!)) return json({error:"Valid bbox is required"},400);
  if((north!-south!)>.5||(east!-west!)>.5) return json({error:"Batch bbox exceeds bounded ingestion limit"},413);

  const {data:batch,error:batchError}=await service.from("afat_geo_import_batches").insert({
    source_key:sourceKey,dataset_version:datasetVersion,scope_label:`${city.city_name}:${scopeLabel}`,
    scope_bbox:{south,west,north,east,city_key:cityKey},import_mode:"candidate_only",status:"running",
    requested_by:identity.id,input_count:records.length,
    license_snapshot:{license:source.license_expression,attribution:source.attribution_text,usage_constraints:source.usage_constraints,data_mode:cap.data_mode}
  }).select("id").single();
  if(batchError||!batch) return json({error:"Could not create import batch",detail:batchError?.message},500);

  let accepted=0,rejected=0; const errors:string[]=[];
  for(const raw of records){
    try{
      const featureKind=String(raw.source_feature_kind||raw.feature_kind||"").trim();
      const geojson=raw.geometry||raw.geojson;
      const externalId=String(raw.external_feature_id||"").trim();
      if(!externalId||!["point","line","polygon","multipolygon"].includes(featureKind)||!geojson){
        rejected++; if(errors.length<12) errors.push(`${externalId||"missing-id"}: invalid normalized feature`); continue;
      }
      const {error}=await service.rpc("afat_register_geo_source_record",{
        p_source_key:sourceKey,
        p_external_feature_id:externalId,
        p_import_batch_id:batch.id,
        p_dataset_version:datasetVersion,
        p_feature_kind:featureKind,
        p_canonical_name:String(raw.canonical_name||externalId).slice(0,240),
        p_alternate_names:Array.isArray(raw.alternate_names)?raw.alternate_names.map(String).slice(0,20):[],
        p_source_category:String(raw.source_category||"unknown").slice(0,120),
        p_source_address:raw.source_address?String(raw.source_address).slice(0,300):null,
        p_geojson:geojson,
        p_source_confidence:Math.max(0,Math.min(1,Number(raw.source_confidence??0.5))),
        p_source_properties:{...(raw.source_properties||{}),city_key:cityKey,city_name:city.city_name,ingest_gateway:"afat-source-batch-ingest"},
        p_record_fingerprint:String(raw.record_fingerprint||crypto.randomUUID()),
        p_source_license:String(raw.source_license||source.license_expression),
        p_attribution_text:String(raw.attribution_text||source.attribution_text)
      });
      if(error){rejected++;if(errors.length<12)errors.push(`${externalId}: ${error.message}`);} else accepted++;
    }catch(e){rejected++;if(errors.length<12)errors.push(String(e));}
  }
  const status=rejected===0?"completed":accepted>0?"completed_with_errors":"failed";
  await service.from("afat_geo_import_batches").update({
    status,inserted_count:accepted,rejected_count:rejected,error_summary:errors.length?errors.join(" | "):null,
    finished_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",batch.id);
  await service.from("afat_city_source_plans").update({
    last_run_at:new Date().toISOString(),last_success_at:accepted>0?new Date().toISOString():null,
    last_result:{batch_id:batch.id,accepted,rejected,status,dataset_version:datasetVersion},
    plan_state:accepted>0?"ready":"error",updated_at:new Date().toISOString()
  }).eq("city_profile_id",city.id).eq("source_key",sourceKey);

  return json({batch_id:batch.id,city_key:cityKey,source_key:sourceKey,dataset_version:datasetVersion,accepted_count:accepted,rejected_count:rejected,status,errors});
});