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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration is incomplete." }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

  let invitationId = "";
  try {
    const payload = await request.json();
    invitationId = String(payload.invitationId ?? "");
  } catch {
    return json({ error: "A JSON request body is required." }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return json({ error: "A valid invitationId is required." }, 400);

  // RLS proves that the caller may inspect this invitation.
  const { data: invitation, error: invitationError } = await userClient
    .from("dreem_staff_invitations")
    .select("id,school_id,email,full_name,role,status,expires_at")
    .eq("id", invitationId)
    .single();
  if (invitationError || !invitation) return json({ error: "Invitation not found or access denied." }, 404);
  if (invitation.status !== "pending") return json({ error: "Only pending invitations can be provisioned." }, 409);
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return json({ error: "Invitation has expired." }, 409);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectTo = Deno.env.get("DREEM_APP_URL") || undefined;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo,
    data: { full_name: invitation.full_name },
  });
  if (inviteError || !invited.user) return json({ error: inviteError?.message ?? "User invitation failed." }, 409);

  const { error: membershipError } = await admin.from("dreem_school_memberships").upsert({
    profile_id: invited.user.id,
    school_id: invitation.school_id,
    role: invitation.role,
    status: "pending",
    invited_by: authData.user.id,
  }, { onConflict: "profile_id,school_id" });
  if (membershipError) return json({ error: "The invitation was sent, but membership provisioning failed." }, 500);

  const { error: updateError } = await admin.from("dreem_staff_invitations").update({
    accepted_by: invited.user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", invitation.id);
  if (updateError) return json({ error: "Membership was created, but invitation tracking failed." }, 500);

  return json({ userId: invited.user.id, membershipStatus: "pending", invitationId: invitation.id }, 201);
});

