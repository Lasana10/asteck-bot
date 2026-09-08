import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OVERPASS = "https://overpass-api.de/api/interpreter";

const CELLS: Record<string, [number, number, number, number]> = {
  central: [3.8400, 11.4950, 3.8900, 11.5450],
  west: [3.8200, 11.4450, 3.8900, 11.4950],
  east: [3.8200, 11.5450, 3.8900, 11.5950],
  north: [3.8900, 11.4700, 3.9500, 11.5600],
  south: [3.7700, 11.4700, 3.8400, 11.5600],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function roadName(tags: Record<string, unknown>, id: number) {
  return normalizeName(tags.name || tags.ref || tags["name:en"] || tags["name:fr"]) || `OSM road ${id}`;
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Authenticated AFAT identity required" }, 401);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) return json({ error: "AFAT authority lookup failed" }, 500);
  const role = String(profile?.role || "").toLowerCase();
  if (!profile?.is_active || !["admin", "planner"].includes(role)) {
    return json({ error: "Planner or admin authority required" }, 403);
  }

  const payload = await req.json().catch(() => ({}));
  const cellKey = String(payload?.cell || "central").toLowerCase();
  const bbox = CELLS[cellKey];
  if (!bbox) return json({ error: "Unknown Yaounde ingestion cell", allowed_cells: Object.keys(CELLS) }, 400);
  const [south, west, north, east] = bbox;

  const query = `[out:json][timeout:45];way[\"highway\"](${south},${west},${north},${east});out body geom;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let overpass: Response;
  try {
    overpass = await fetch(OVERPASS, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent": "AFAT-Atlas/1.0 (controlled Yaounde ingestion)",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return json({ error: "Overpass fetch failed", detail: String(error) }, 502);
  }
  clearTimeout(timer);
  if (!overpass.ok) return json({ error: "Overpass rejected request", status: overpass.status }, 502);

  const rawText = await overpass.text();
  if (rawText.length > 12_000_000) return json({ error: "Overpass cell response exceeded AFAT safety bound" }, 413);
  let osm: any;
  try { osm = JSON.parse(rawText); } catch { return json({ error: "Invalid Overpass JSON" }, 502); }

  const elements = Array.isArray(osm?.elements) ? osm.elements : [];
  const ways = elements.filter((item: any) => item?.type === "way" && Array.isArray(item.geometry) && item.geometry.length >= 2);
  const osmBase = String(osm?.osm3s?.timestamp_osm_base || new Date().toISOString());
  const datasetVersion = `overpass:${osmBase}`;

  const { data: source } = await service
    .from("afat_geo_sources")
    .select("license_expression,attribution_text")
    .eq("source_key", "openstreetmap")
    .single();
  if (!source) return json({ error: "OSM source contract unavailable" }, 500);

  const { data: batch, error: batchError } = await service
    .from("afat_geo_import_batches")
    .insert({
      source_key: "openstreetmap",
      dataset_version: datasetVersion,
      scope_label: `Yaounde:${cellKey}`,
      scope_bbox: { south, west, north, east },
      import_mode: "candidate_only",
      status: "running",
      requested_by: profile.id,
      input_count: ways.length,
      license_snapshot: {
        license: source.license_expression,
        attribution: source.attribution_text,
        endpoint: OVERPASS,
        query_scope: "highway ways only",
      },
    })
    .select("id")
    .single();
  if (batchError || !batch) return json({ error: "Could not create Atlas import batch", detail: batchError?.message }, 500);

  let accepted = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const way of ways.slice(0, 5000)) {
    try {
      const tags = way.tags && typeof way.tags === "object" ? way.tags : {};
      const coordinates = way.geometry
        .map((point: any) => [Number(point.lon), Number(point.lat)])
        .filter((point: number[]) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (coordinates.length < 2) { rejected++; continue; }

      const osmNodeIds = Array.isArray(way.nodes)
        ? way.nodes.map((nodeId: unknown) => Number(nodeId)).filter((nodeId: number) => Number.isSafeInteger(nodeId))
        : [];
      const topologyAligned = osmNodeIds.length === coordinates.length;
      const geojson = { type: "LineString", coordinates };
      const externalId = `way/${way.id}`;
      const name = roadName(tags, Number(way.id));
      const fingerprint = await sha256(JSON.stringify({ externalId, tags, coordinates, osmNodeIds }));
      const alternateNames = [tags["name:en"], tags["name:fr"], tags.alt_name, tags.old_name]
        .map(normalizeName)
        .filter((value: string, index: number, arr: string[]) => value && value !== name && arr.indexOf(value) === index);

      const { error } = await service.rpc("afat_register_geo_source_record", {
        p_source_key: "openstreetmap",
        p_external_feature_id: externalId,
        p_import_batch_id: batch.id,
        p_dataset_version: datasetVersion,
        p_feature_kind: "line",
        p_canonical_name: name,
        p_alternate_names: alternateNames,
        p_source_category: normalizeName(tags.highway) || "road",
        p_source_address: null,
        p_geojson: geojson,
        p_source_confidence: 55,
        p_source_properties: {
          osm_type: "way",
          osm_id: way.id,
          osm_node_ids: osmNodeIds,
          topology_aligned: topologyAligned,
          tags,
          ingestion_cell: cellKey,
          upstream_timestamp: osmBase,
        },
        p_record_fingerprint: fingerprint,
        p_source_license: source.license_expression,
        p_attribution_text: source.attribution_text,
      });
      if (error) {
        rejected++;
        if (errors.length < 10) errors.push(`${externalId}: ${error.message}`);
      } else {
        accepted++;
      }
    } catch (error) {
      rejected++;
      if (errors.length < 10) errors.push(String(error));
    }
  }

  const finalStatus = rejected > 0 && accepted === 0 ? "failed" : rejected > 0 ? "completed_with_errors" : "completed";
  await service.from("afat_geo_import_batches").update({
    status: finalStatus,
    inserted_count: accepted,
    rejected_count: rejected,
    error_summary: errors.length ? errors.join(" | ") : null,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", batch.id);

  return json({
    batch_id: batch.id,
    source: "openstreetmap",
    cell: cellKey,
    dataset_version: datasetVersion,
    input_way_count: ways.length,
    processed_way_count: Math.min(ways.length, 5000),
    accepted_count: accepted,
    rejected_count: rejected,
    status: finalStatus,
    note: "Records remain source candidates; OSM node sequences are preserved for topology review, but this function does not promote roads directly into canonical AFAT Atlas.",
  });
});
