import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify admin password
  const password = req.headers.get("x-admin-password");
  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  if (!password || password !== adminPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";

  try {
    if (action === "list") {
      // List all users from auth + profiles + connectors + import logs
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) throw authError;

      const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
      const { data: connectors } = await supabaseAdmin.from("user_connectors").select("*");
      const { data: importLogs } = await supabaseAdmin.from("import_logs").select("*");
      const { data: apiKeys } = await supabaseAdmin.from("api_keys").select("id,user_id,name,key_prefix,last_used_at,revoked_at,created_at");

      const users = authUsers.users.map((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        const userConnectors = connectors?.filter((c) => c.user_id === u.id) || [];
        const userImports = importLogs?.filter((l) => l.user_id === u.id) || [];
        const userApiKeys = apiKeys?.filter((k) => k.user_id === u.id) || [];
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          profile,
          connectors: userConnectors,
          import_logs: userImports,
          api_keys: userApiKeys,
        };
      });

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-user") {
      const userId = url.searchParams.get("userId");
      if (!userId) throw new Error("userId required");

      const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (error) throw error;

      const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      const { data: connectors } = await supabaseAdmin.from("user_connectors").select("*").eq("user_id", userId);
      const { data: importLogs } = await supabaseAdmin.from("import_logs").select("*").eq("user_id", userId);
      const { data: apiKeys } = await supabaseAdmin
        .from("api_keys")
        .select("id,name,key_prefix,last_used_at,revoked_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({
        user: {
          id: authUser.user.id,
          email: authUser.user.email,
          created_at: authUser.user.created_at,
          last_sign_in_at: authUser.user.last_sign_in_at,
          profile,
          connectors: connectors || [],
          import_logs: importLogs || [],
          api_keys: apiKeys || [],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-profile") {
      const body = await req.json();
      const { userId, updates } = body;
      if (!userId || !updates) throw new Error("userId and updates required");

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ profile: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-connector") {
      const body = await req.json();
      const { connectorId, updates } = body;
      if (!connectorId || !updates) throw new Error("connectorId and updates required");

      const { data, error } = await supabaseAdmin
        .from("user_connectors")
        .update(updates)
        .eq("id", connectorId)
        .select()
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ connector: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-user") {
      const body = await req.json();
      const { userId } = body;
      if (!userId) throw new Error("userId required");

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "impersonate") {
      const body = await req.json();
      const { userId } = body;
      if (!userId) throw new Error("userId required");

      const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userErr) throw userErr;
      const email = authUser?.user?.email;
      if (!email) throw new Error("User has no email");

      const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkErr) throw linkErr;

      return new Response(JSON.stringify({
        email,
        token_hash: link.properties?.hashed_token,
        action_link: link.properties?.action_link,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "connector-requests") {
      const { data, error } = await supabaseAdmin
        .from("connector_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Enrich with user emails
      const userIds = [...new Set((data || []).map((r: any) => r.user_id))];
      const emailMap = new Map<string, string>();
      for (const uid of userIds) {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (u?.user?.email) emailMap.set(uid, u.user.email);
        } catch {}
      }

      const requests = (data || []).map((r: any) => ({
        ...r,
        email: emailMap.get(r.user_id) || "Unknown",
      }));

      return new Response(JSON.stringify({ requests }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
