import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Authenticate via x-api-key header
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("N8N_API_KEY");

  if (!expectedKey) {
    return new Response(JSON.stringify({ error: "N8N_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const companyId = url.searchParams.get("company_id");
  const since = url.searchParams.get("since"); // ISO date filter

  try {
    // Fetch companies
    let companiesQuery = supabase.from("companies").select("*");
    if (userId) companiesQuery = companiesQuery.eq("user_id", userId);
    if (companyId) companiesQuery = companiesQuery.eq("id", companyId);

    const { data: companies, error: cErr } = await companiesQuery;
    if (cErr) throw cErr;

    // Fetch snapshots
    let snapshotsQuery = supabase.from("company_snapshots").select("*").order("snapshot_date", { ascending: false });
    if (userId) snapshotsQuery = snapshotsQuery.eq("user_id", userId);
    if (companyId) snapshotsQuery = snapshotsQuery.eq("company_id", companyId);
    if (since) snapshotsQuery = snapshotsQuery.gte("snapshot_date", since);

    const { data: snapshots, error: sErr } = await snapshotsQuery;
    if (sErr) throw sErr;

    return new Response(JSON.stringify({ companies, snapshots }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
