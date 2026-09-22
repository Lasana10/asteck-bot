import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const STAC="https://stac.dataspace.copernicus.eu/v1/search";
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
function finite(v:unknown){const n=Number(v);return Number.isFinite(n)?n:null;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"POST required"},405);
  const auth=req.headers.get("authorization")||"";
  const user=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const service=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false}});
  const {data:{user:identity}}=await user.auth.getUser();
  if(!identity) return json({error:"Authenticated AFAT identity required"},401);
  const {data:allowed}=await user.rpc("afat_has_permission",{p_permission_key:"planning.aggregate.view",p_company_id:null});
  if(allowed!==true) return json({error:"Planning authority required"},403);

  const body=await req.json().catch(()=>({}));
  const cityKey=String(body.city_key||"").trim().toLowerCase();
  const {data:city}=await service.from("afat_city_profiles").select("id,city_name").eq("city_key",cityKey).eq("status","active").maybeSingle();
  if(!city) return json({error:"Active city profile required"},404);
  const b=body.bbox||{};
  const south=finite(b.south),west=finite(b.west),north=finite(b.north),east=finite(b.east);
  if([south,west,north,east].some(v=>v===null)||!(south!<north!&&west!<east!)) return json({error:"Valid bbox is required"},400);
  if((north!-south!)>1||(east!-west!)>1) return json({error:"Remote discovery bbox too large"},413);
  const days=Math.max(1,Math.min(90,Number(body.days||30)));
  const end=new Date(); const start=new Date(end.getTime()-days*86400000);
  const stacBody={
    collections:["sentinel-2-l2a"],
    bbox:[west,south,east,north],
    datetime:`${start.toISOString()}/${end.toISOString()}`,
    limit:Math.max(1,Math.min(50,Number(body.limit||20))),
    sortby:[{field:"datetime",direction:"desc"}]
  };
  let response:Response;
  try{
    response=await fetch(STAC,{method:"POST",headers:{"content-type":"application/json","user-agent":"AFAT-WorldModel/1.0"},body:JSON.stringify(stacBody)});
  }catch(e){return json({error:"Copernicus STAC request failed",detail:String(e)},502);}
  if(!response.ok) return json({error:"Copernicus STAC rejected request",status:response.status,detail:(await response.text()).slice(0,500)},502);
  const data=await response.json();
  const features=Array.isArray(data?.features)?data.features:[];
  const scenes=features.map((f:any)=>({
    id:String(f.id||""),
    datetime:f.properties?.datetime||null,
    cloud_cover:f.properties?.["eo:cloud_cover"]??null,
    collection:f.collection||null,
    bbox:f.bbox||null,
    self:f.links?.find((x:any)=>x.rel==="self")?.href||null
  }));
  const latest=scenes[0]?.datetime||null;
  await service.from("afat_city_source_plans").update({
    last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),plan_state:"ready",
    last_result:{scene_count:scenes.length,latest_scene_at:latest,days,stac_endpoint:STAC},
    updated_at:new Date().toISOString()
  }).eq("city_profile_id",city.id).eq("source_key","copernicus_sentinel");

  return json({
    city_key:cityKey,source_key:"copernicus_sentinel",scene_count:scenes.length,latest_scene_at:latest,
    scenes,notice:"Scene metadata only. AFAT does not infer physical change until an external/AFAT comparison process submits a reviewable change signal."
  });
});