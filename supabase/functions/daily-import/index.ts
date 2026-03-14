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
  intercom: async (apiKey, userId, supabase) => {
    const listUrl = "https://api.intercom.io/companies/list";
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1. Paginate through all Intercom companies
    const allCompanies: Array<Record<string, any>> = [];
    let startingAfter: string | undefined;

    do {
      const body: Record<string, any> = { per_page: 50 };
      if (startingAfter) body.starting_after = startingAfter;

      const res = await fetch(listUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Intercom API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      allCompanies.push(...(data.data || []));
      startingAfter = data.pages?.next?.starting_after || undefined;
    } while (startingAfter);

    if (allCompanies.length === 0) {
      console.log(`[Intercom] No companies found for user ${userId}`);
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

    // 3. Process each Intercom company
    for (const ic of allCompanies) {
      const name = ic.name?.trim();
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
            industry: ic.industry || "",
            email: "",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Intercom] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Build snapshot data from Intercom fields
      const snapshotData: Record<string, any> = {};

      if (ic.monthly_spend != null) {
        snapshotData.mrr = Number(ic.monthly_spend);
      }
      if (ic.session_count != null) {
        snapshotData.usageScore = Math.min(100, Math.round((Number(ic.session_count) / 200) * 100));
      }
      if (ic.user_count != null) {
        snapshotData.activeUsers = Number(ic.user_count);
      }
      if (ic.last_request_at) {
        snapshotData.lastLogin = new Date(ic.last_request_at * 1000).toISOString().split("T")[0];
      }
      if (ic.plan?.name) {
        snapshotData.plan = ic.plan.name;
      }
      // Pull in any custom attributes
      if (ic.custom_attributes) {
        for (const [key, value] of Object.entries(ic.custom_attributes)) {
          if (value != null && value !== "") {
            const snakeKey = key.replace(/\s+/g, "_").toLowerCase();
            snapshotData[snakeKey] = value;
          }
        }
      }

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            source: "intercom",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Intercom] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Intercom] Imported ${imported} companies for user ${userId}`);
    return { records: imported };
  },
  salesforce: async (apiKey, userId, supabase) => {
    // Parse instance URL and access token from stored key (format: instanceUrl|accessToken)
    const separatorIndex = apiKey.indexOf("|");
    if (separatorIndex === -1) {
      throw new Error("Invalid Salesforce credentials. Expected format: instanceUrl|accessToken");
    }
    const instanceUrl = apiKey.substring(0, separatorIndex).replace(/\/+$/, "");
    const accessToken = apiKey.substring(separatorIndex + 1);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const soql = encodeURIComponent(
      "SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees, LastActivityDate, Rating, Website FROM Account ORDER BY Name ASC"
    );

    // 1. Paginate through all Salesforce Accounts
    const allAccounts: Array<Record<string, any>> = [];
    let url: string | null = `${instanceUrl}/services/data/v59.0/query?q=${soql}`;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Salesforce API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      allAccounts.push(...(data.records || []));

      if (data.done) {
        url = null;
      } else if (data.nextRecordsUrl) {
        url = `${instanceUrl}${data.nextRecordsUrl}`;
      } else {
        url = null;
      }
    }

    if (allAccounts.length === 0) {
      console.log(`[Salesforce] No accounts found for user ${userId}`);
      return { records: 0 };
    }

    // 2. Fetch existing companies for this user
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    const companyByName = new Map(
      (existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c])
    );

    let imported = 0;

    // 3. Process each Salesforce Account
    for (const account of allAccounts) {
      const name = account.Name?.trim();
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
            industry: account.Industry || "",
            email: account.Website ? `info@${new URL(account.Website).hostname}` : "",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Salesforce] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Build snapshot data
      const snapshotData: Record<string, any> = {};

      if (account.AnnualRevenue != null) {
        snapshotData.mrr = Math.round(Number(account.AnnualRevenue) / 12);
      }
      if (account.NumberOfEmployees != null) {
        snapshotData.employees = Number(account.NumberOfEmployees);
      }
      if (account.LastActivityDate) {
        snapshotData.lastLogin = account.LastActivityDate;
      }
      if (account.Rating) {
        const ratingMap: Record<string, number> = { Hot: 90, Warm: 60, Cold: 30 };
        snapshotData.usageScore = ratingMap[account.Rating] || 50;
        snapshotData.rating = account.Rating;
      }

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            source: "salesforce",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Salesforce] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Salesforce] Imported ${imported} accounts for user ${userId}`);
    return { records: imported };
  },
  zendesk: async (apiKey, userId, supabase) => {
    // Parse stored credentials: subdomain|email/token|apiToken
    const parts = apiKey.split("|");
    if (parts.length < 3) {
      throw new Error("Invalid Zendesk credentials. Expected format: subdomain|email/token|apiToken");
    }
    const [subdomain, emailToken, apiToken] = parts;
    const authHeader = "Basic " + btoa(`${emailToken}:${apiToken}`);
    const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
    const headers = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };

    // 1. Paginate through all organizations
    const allOrgs: Array<Record<string, any>> = [];
    let url: string | null = `${baseUrl}/organizations.json?page[size]=100`;

    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Zendesk API error ${res.status}: ${text}`);
      }
      const data = await res.json();
      allOrgs.push(...(data.organizations || []));
      url = data.meta?.has_more ? data.links?.next : null;
    }

    if (allOrgs.length === 0) {
      console.log(`[Zendesk] No organizations found for user ${userId}`);
      return { records: 0 };
    }

    // 2. Fetch existing companies for this user
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    const companyByName = new Map(
      (existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c])
    );

    let imported = 0;

    // 3. Process each organization
    for (const org of allOrgs) {
      const name = org.name?.trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        const industry = org.organization_fields?.industry || "";
        const { data: newCompany, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry, email: "" })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Zendesk] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Fetch open ticket count for this org
      let ticketCount = 0;
      try {
        const ticketRes = await fetch(
          `${baseUrl}/organizations/${org.id}/tickets.json?per_page=1`,
          { headers }
        );
        if (ticketRes.ok) {
          const ticketData = await ticketRes.json();
          ticketCount = ticketData.count || 0;
        } else {
          await ticketRes.text();
        }
      } catch (err) {
        console.warn(`[Zendesk] Failed to fetch ticket count for "${name}":`, err);
      }

      // Build snapshot data
      const snapshotData: Record<string, any> = {
        supportTickets: ticketCount,
      };

      if (org.organization_fields?.contract_end) {
        snapshotData.contractEnd = org.organization_fields.contract_end;
      }
      if (org.tags?.length) {
        snapshotData.tags = org.tags.join(", ");
      }
      if (org.organization_fields) {
        for (const [key, value] of Object.entries(org.organization_fields)) {
          if (value != null && value !== "" && key !== "industry" && key !== "contract_end") {
            snapshotData[key] = value;
          }
        }
      }

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            source: "zendesk",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Zendesk] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Zendesk] Imported ${imported} organizations for user ${userId}`);
    return { records: imported };
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
