import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json({ error: "Server configuration is incomplete." }, 500);

  let membershipId = "";
  let status = "";
  try {
    const payload = await request.json();
    membershipId = String(payload.membershipId ?? "");
    status = String(payload.status ?? "");
  } catch {
    return json({ error: "A JSON request body is required." }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) return json({ error: "A valid membershipId is required." }, 400);
  if (!["pending", "approved", "suspended", "rejected"].includes(status)) return json({ error: "Unsupported access status." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

  // The database function is the authority and enforces school role checks.
  const { data, error } = await userClient.rpc("dreem_update_membership_status", {
    p_membership_id: membershipId,
    p_status: status,
  });
  if (error) return json({ error: error.message }, 403);
  const membership = Array.isArray(data) ? data[0] : data;
  return json({ membershipId: membership.membership_id, status: membership.membership_status });
});

