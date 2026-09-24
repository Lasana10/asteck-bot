import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
function keyFromJson(name:string,key:string){try{return JSON.parse(Deno.env.get(name)||"{}")[key]||"";}catch{return "";}}
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||keyFromJson("SUPABASE_PUBLISHABLE_KEYS","default");
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||keyFromJson("SUPABASE_SECRET_KEYS","default");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
const STAC="https://explorer.digitalearth.africa/stac";
const KEYWORDS=["sentinel-1","sentinel 1","sentinel-2","sentinel 2","wofs","waterbody","water body","worldcover","srtm","chirps","geomad","geo mad","settlement","elevation","dem","land cover"];
async function fetchJson(url:string,init?:RequestInit){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{...init,signal:c.signal,headers:{"accept":"application/json","content-type":"application/json",...(init?.headers||{})}});const text=await r.text();let body:any=null;try{body=text?JSON.parse(text):null;}catch{body={raw:text.slice(0,500)}}return {ok:r.ok,status:r.status,body};}finally{clearTimeout(t);}}
function relevant(c:any){const hay=[c?.id,c?.title,c?.description,c?.keywords].flat(Infinity).filter(Boolean).join(" ").toLowerCase();return KEYWORDS.some(k=>hay.includes(k));}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"POST required"},405);
 if(!ANON||!SERVICE)return json({error:"Supabase keys unavailable"},500);
 const auth=req.headers.get("authorization")||"";
 const user=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const service=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false}});
 const {data:{user:identity}}=await user.auth.getUser();if(!identity)return json({error:"Authenticated AFAT identity required"},401);
 const perms=await Promise.all([
  user.rpc("afat_has_permission",{p_permission_key:"planning.aggregate.view",p_company_id:null}),
  user.rpc("afat_has_permission",{p_permission_key:"map.evidence.review",p_company_id:null}),
  user.rpc("afat_has_permission",{p_permission_key:"system.configure",p_company_id:null})
 ]);if(!perms.some(x=>x.data===true))return json({error:"Source intelligence permission required"},403);
 const body=await req.json().catch(()=>({}));const action=String(body.action||"discover");const cityKey=String(body.city_key||"cm-yaounde").toLowerCase();
 const {data:city}=await service.from("afat_city_profiles").select("id,city_key,city_name").eq("city_key",cityKey).eq("status","active").maybeSingle();if(!city)return json({error:"Active city profile required"},404);
 const cols=await fetchJson(STAC+"/collections");if(!cols.ok)return json({error:"Digital Earth Africa STAC collections unavailable",http_status:cols.status},502);
 const collections=(Array.isArray(cols.body?.collections)?cols.body.collections:[]).filter(relevant).map((c:any)=>({id:c.id,title:c.title||c.id,description:String(c.description||"").slice(0,220),license:c.license||null,extent:c.extent||null}));
 if(action==="catalog"){return json({city_key:cityKey,source_key:"digital_earth_africa",collections,automatic_promotion:false});}
 const {data:nodes}=await service.from("afat_atlas_nodes").select("latitude,longitude").eq("city",city.city_name).eq("status","active").limit(5000);
 if(!nodes?.length)return json({error:"City map bounds are not available yet"},409);
 let south=90,north=-90,west=180,east=-180;for(const x of nodes){south=Math.min(south,Number(x.latitude));north=Math.max(north,Number(x.latitude));west=Math.min(west,Number(x.longitude));east=Math.max(east,Number(x.longitude));}
 south-=.03;north+=.03;west-=.03;east+=.03;
 const requested=Array.isArray(body.collection_ids)?body.collection_ids.map(String):[];
 const selected=(requested.length?collections.filter((c:any)=>requested.includes(c.id)):collections.slice(0,12));
 const days=Math.max(1,Math.min(3650,Number(body.days||365)));const from=new Date(Date.now()-days*86400000).toISOString();const to=new Date().toISOString();
 const discoveries:any[]=[];
 for(const c of selected){
  const res=await fetchJson(STAC+"/search",{method:"POST",body:JSON.stringify({collections:[c.id],bbox:[west,south,east,north],datetime:`${from}/${to}`,limit:5})});
  const features=Array.isArray(res.body?.features)?res.body.features:[];
  discoveries.push({collection_id:c.id,title:c.title,http_status:res.status,item_count:features.length,latest_item_at:features.map((f:any)=>f?.properties?.datetime||f?.properties?.end_datetime).filter(Boolean).sort().at(-1)||null,sample_ids:features.slice(0,5).map((f:any)=>f.id)});
 }
 await service.from("afat_city_source_plans").update({last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),last_result:{bbox:{west,south,east,north},collection_count:collections.length,discoveries,checked_at:new Date().toISOString(),truth_rule:"scene availability is evidence inventory, not mobility truth"},plan_state:"ready",updated_at:new Date().toISOString()}).eq("city_profile_id",city.id).eq("source_key","digital_earth_africa");
 return json({city_key:cityKey,source_key:"digital_earth_africa",bbox:{west,south,east,north},collection_count:collections.length,discoveries,policy:{automatic_promotion:false,environmental_hypothesis_only:true}});
});