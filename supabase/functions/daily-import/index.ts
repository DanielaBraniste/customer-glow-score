import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Connector-specific import handlers (scaffold)
// Each returns { records: number } or throws on error
const importHandlers: Record<string, (apiKey: string, userId: string) => Promise<{ records: number }>> = {
  hubspot: async (apiKey, userId) => {
    // TODO: Implement HubSpot API call
    // GET https://api.hubapi.com/crm/v3/objects/companies
    console.log(`[HubSpot] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  intercom: async (apiKey, userId) => {
    // TODO: Implement Intercom API call
    // GET https://api.intercom.io/contacts
    console.log(`[Intercom] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  salesforce: async (apiKey, userId) => {
    // TODO: Implement Salesforce API call
    console.log(`[Salesforce] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  zendesk: async (apiKey, userId) => {
    console.log(`[Zendesk] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  pipedrive: async (apiKey, userId) => {
    console.log(`[Pipedrive] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  stripe: async (apiKey, userId) => {
    console.log(`[Stripe] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  segment: async (apiKey, userId) => {
    console.log(`[Segment] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  slack: async (apiKey, userId) => {
    console.log(`[Slack] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active connectors
    const { data: activeConnectors, error: fetchError } = await supabase
      .from("user_connectors")
      .select("*")
      .eq("is_active", true);

    if (fetchError) throw new Error(`Failed to fetch connectors: ${fetchError.message}`);

    console.log(`[daily-import] Found ${activeConnectors?.length || 0} active connectors`);

    const results = [];

    for (const connector of activeConnectors || []) {
      const handler = importHandlers[connector.connector_id];
      if (!handler) {
        console.log(`[daily-import] No handler for connector: ${connector.connector_id}`);
        continue;
      }

      // Create import log entry
      const { data: log } = await supabase
        .from("import_logs")
        .insert({
          user_id: connector.user_id,
          connector_id: connector.connector_id,
          status: "running",
        })
        .select()
        .single();

      try {
        const result = await handler(connector.api_key, connector.user_id);

        // Update log as success
        await supabase
          .from("import_logs")
          .update({
            status: "success",
            records_imported: result.records,
            completed_at: new Date().toISOString(),
          })
          .eq("id", log?.id);

        // Update last_import_at on connector
        await supabase
          .from("user_connectors")
          .update({ last_import_at: new Date().toISOString() })
          .eq("id", connector.id);

        results.push({ connector: connector.connector_id, user: connector.user_id, status: "success", records: result.records });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await supabase
          .from("import_logs")
          .update({
            status: "failed",
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", log?.id);

        results.push({ connector: connector.connector_id, user: connector.user_id, status: "failed", error: errorMessage });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-import] Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
