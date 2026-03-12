import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Connector-specific import handlers
const importHandlers: Record<string, (apiKey: string, userId: string, supabase: ReturnType<typeof createClient>) => Promise<{ records: number }>> = {
  hubspot: async (apiKey, userId, supabase) => {
    const baseUrl = "https://api.hubapi.com/crm/v3/objects/companies";
    const properties = "name,industry,domain,annualrevenue,num_associated_deals,notes_last_updated,hs_lead_status";
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // 1. Paginate through all HubSpot companies
    const allCompanies: Array<{ id: string; properties: Record<string, string | null> }> = [];
    let after: string | undefined;

    do {
      const params = new URLSearchParams({ limit: "100", properties });
      if (after) params.set("after", after);

      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HubSpot API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      allCompanies.push(...(data.results || []));
      after = data.paging?.next?.after;
    } while (after);

    if (allCompanies.length === 0) {
      console.log(`[HubSpot] No companies found for user ${userId}`);
      return { records: 0 };
    }

    // 2. Fetch existing companies for this user to match by name
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    const companyByName = new Map(
      (existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c])
    );

    let imported = 0;

    // 3. Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < allCompanies.length; i += BATCH_SIZE) {
      const batch = allCompanies.slice(i, i + BATCH_SIZE);

      for (const hc of batch) {
        const name = hc.properties.name?.trim();
        if (!name) continue;

        let companyId: string;
        const existing = companyByName.get(name.toLowerCase());

        if (existing) {
          companyId = existing.id;
        } else {
          const { data: newCompany, error: cErr } = await supabase
            .from("companies")
            .insert({
              user_id: userId,
              name,
              industry: hc.properties.industry || "",
              email: hc.properties.domain ? `info@${hc.properties.domain}` : "",
            })
            .select("id")
            .single();

          if (cErr) {
            console.error(`[HubSpot] Failed to create company "${name}":`, cErr.message);
            continue;
          }
          companyId = newCompany.id;
          companyByName.set(name.toLowerCase(), { id: companyId, name });
        }

        // Build snapshot data from HubSpot properties
        const snapshotData: Record<string, any> = {};
        if (hc.properties.annualrevenue) {
          snapshotData.mrr = Math.round(Number(hc.properties.annualrevenue) / 12);
        }
        if (hc.properties.num_associated_deals) {
          snapshotData.deals = Number(hc.properties.num_associated_deals);
        }
        if (hc.properties.notes_last_updated) {
          snapshotData.lastLogin = hc.properties.notes_last_updated.split("T")[0];
        }
        if (hc.properties.hs_lead_status) {
          snapshotData.leadStatus = hc.properties.hs_lead_status;
        }

        // Upsert snapshot (UNIQUE constraint on company_id + snapshot_date)
        const { error: sErr } = await supabase
          .from("company_snapshots")
          .upsert(
            {
              company_id: companyId,
              user_id: userId,
              source: "hubspot",
              data: snapshotData,
            },
            { onConflict: "company_id,snapshot_date" }
          );

        if (sErr) {
          console.error(`[HubSpot] Failed to upsert snapshot for "${name}":`, sErr.message);
          continue;
        }
        imported++;
      }
    }

    console.log(`[HubSpot] Imported ${imported} companies for user ${userId}`);
    return { records: imported };
  },
  intercom: async (_apiKey, userId, _supabase) => {
    console.log(`[Intercom] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  salesforce: async (_apiKey, userId, _supabase) => {
    console.log(`[Salesforce] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  zendesk: async (_apiKey, userId, _supabase) => {
    console.log(`[Zendesk] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  pipedrive: async (_apiKey, userId, _supabase) => {
    console.log(`[Pipedrive] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  stripe: async (_apiKey, userId, _supabase) => {
    console.log(`[Stripe] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  segment: async (_apiKey, userId, _supabase) => {
    console.log(`[Segment] Import for user ${userId} — not yet implemented`);
    return { records: 0 };
  },
  slack: async (_apiKey, userId, _supabase) => {
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

    // Parse optional filters for single-connector import
    let filterConnectorId: string | null = null;
    let filterUserId: string | null = null;
    try {
      const body = await req.json();
      filterConnectorId = body?.connector_id || null;
      filterUserId = body?.user_id || null;
    } catch {
      // No body or invalid JSON — run for all active connectors
    }

    // Fetch active connectors, optionally filtered
    let query = supabase.from("user_connectors").select("*").eq("is_active", true);
    if (filterConnectorId) query = query.eq("connector_id", filterConnectorId);
    if (filterUserId) query = query.eq("user_id", filterUserId);
    const { data: activeConnectors, error: fetchError } = await query;

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
        const result = await handler(connector.api_key, connector.user_id, supabase);

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
