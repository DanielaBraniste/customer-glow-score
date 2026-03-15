import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Connector-specific import handlers
const importHandlers: Record<string, (apiKey: string, userId: string, supabase: ReturnType<typeof createClient>) => Promise<{ records: number }>> = {
  hubspot: async (apiKey, userId, supabase) => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const properties = [
      "name", "industry", "domain",
      "annualrevenue",
      "notes_last_updated", "hs_last_sales_activity_timestamp", "hs_lastmodifieddate",
      "num_associated_deals", "hs_num_open_deals",
      "hs_lead_status", "lifecyclestage",
      "hs_analytics_num_visits", "hs_analytics_num_page_views",
      "hs_feedback_last_nps_rating", "hs_feedback_last_nps_follow_up",
      "closedate", "hs_date_entered_customer",
      "num_associated_contacts",
    ].join(",");

    const baseUrl = "https://api.hubapi.com/crm/v3/objects/companies";

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

    // Batch-fetch ticket associations
    const ticketCounts = new Map<string, number>();
    const ASSOC_BATCH = 100;
    for (let i = 0; i < allCompanies.length; i += ASSOC_BATCH) {
      const batch = allCompanies.slice(i, i + ASSOC_BATCH);
      const ids = batch.map((c) => c.id);
      try {
        const assocRes = await fetch(
          "https://api.hubapi.com/crm/v3/associations/companies/tickets/batch/read",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }),
          }
        );
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          for (const result of assocData.results || []) {
            ticketCounts.set(result.from.id, (result.to || []).length);
          }
        }
      } catch (err) {
        console.warn("[HubSpot] Ticket association fetch failed, continuing:", err);
      }
    }

    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    const companyByName = new Map(
      (existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c])
    );

    let imported = 0;

    for (const hc of allCompanies) {
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
          console.error(`[HubSpot] Failed to create "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const p = hc.properties;
      const snapshotData: Record<string, any> = {};

      // MRR (core 1/6)
      if (p.annualrevenue) snapshotData.mrr = Math.round(Number(p.annualrevenue) / 12);

      // NPS (core 2/6)
      if (p.hs_feedback_last_nps_rating != null) snapshotData.nps = Number(p.hs_feedback_last_nps_rating);

      // lastLogin (core 3/6)
      const activityDate = p.hs_last_sales_activity_timestamp || p.notes_last_updated || p.hs_lastmodifieddate;
      if (activityDate) snapshotData.lastLogin = activityDate.split("T")[0];

      // supportTickets (core 4/6)
      const tickets = ticketCounts.get(hc.id);
      if (tickets != null) snapshotData.supportTickets = tickets;

      // contractEnd (core 5/6)
      if (p.closedate) snapshotData.contractEnd = p.closedate.split("T")[0];

      // usageScore (core 6/6)
      if (p.hs_analytics_num_visits) {
        const visits = Number(p.hs_analytics_num_visits);
        snapshotData.usageScore = Math.min(100, Math.round((visits / 500) * 100));
      }

      // Extras
      if (p.num_associated_deals) snapshotData.deals = Number(p.num_associated_deals);
      if (p.hs_num_open_deals) snapshotData.openDeals = Number(p.hs_num_open_deals);
      if (p.hs_lead_status) snapshotData.leadStatus = p.hs_lead_status;
      if (p.lifecyclestage) snapshotData.lifecycleStage = p.lifecyclestage;
      if (p.hs_analytics_num_page_views) snapshotData.pageViews = Number(p.hs_analytics_num_page_views);

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "hubspot", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[HubSpot] Snapshot failed for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[HubSpot] Imported ${imported} companies for user ${userId}`);
    return { records: imported };
  },

  intercom: async (apiKey, userId, supabase) => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.11",
    };

    const allCompanies: Array<Record<string, any>> = [];
    let startingAfter: string | undefined;

    do {
      const body: Record<string, any> = { per_page: 50 };
      if (startingAfter) body.starting_after = startingAfter;

      const res = await fetch("https://api.intercom.io/companies/list", {
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

    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    const companyByName = new Map(
      (existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c])
    );

    let imported = 0;

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
          .insert({ user_id: userId, name, industry: ic.industry || "", email: "" })
          .select("id")
          .single();

        if (cErr) { console.error(`[Intercom] Failed to create "${name}":`, cErr.message); continue; }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};
      const customAttrs = ic.custom_attributes || {};

      // MRR (core 1/6)
      if (ic.monthly_spend != null) snapshotData.mrr = Number(ic.monthly_spend);

      // NPS (core 2/6) — from custom attributes
      for (const [key, val] of Object.entries(customAttrs)) {
        const k = key.toLowerCase().replace(/[\s_-]/g, "");
        if ((k === "nps" || k === "npsscore" || k === "netpromoterscore") && val != null) {
          snapshotData.nps = Number(val);
          break;
        }
      }

      // lastLogin (core 3/6)
      if (ic.last_request_at) {
        snapshotData.lastLogin = new Date(ic.last_request_at * 1000).toISOString().split("T")[0];
      }

      // supportTickets (core 4/6) — open conversations
      try {
        const convRes = await fetch("https://api.intercom.io/conversations/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: {
              operator: "AND",
              value: [
                { field: "company_id", operator: "=", value: ic.company_id || ic.id },
                { field: "open", operator: "=", value: true },
              ],
            },
            pagination: { per_page: 1 },
          }),
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          snapshotData.supportTickets = convData.total_count ?? (convData.conversations?.length || 0);
        }
      } catch (err) {
        console.warn(`[Intercom] Conversation count failed for "${name}":`, err);
      }

      // contractEnd (core 5/6) — from custom attributes
      for (const [key, val] of Object.entries(customAttrs)) {
        const k = key.toLowerCase().replace(/[\s_-]/g, "");
        if ((k === "contractend" || k === "renewaldate" || k === "contractrenewal" || k === "contractexpiry") && val) {
          snapshotData.contractEnd = String(val).split("T")[0];
          break;
        }
      }

      // usageScore (core 6/6)
      if (ic.session_count != null) {
        snapshotData.usageScore = Math.min(100, Math.round((Number(ic.session_count) / 300) * 100));
      }

      // Extras
      if (ic.user_count != null) snapshotData.activeUsers = Number(ic.user_count);
      if (ic.plan?.name) snapshotData.plan = ic.plan.name;

      // Remaining custom attributes
      const mappedCustomKeys = new Set<string>();
      for (const [key] of Object.entries(customAttrs)) {
        const k = key.toLowerCase().replace(/[\s_-]/g, "");
        if (["nps", "npsscore", "netpromoterscore", "contractend", "renewaldate", "contractrenewal", "contractexpiry"].includes(k)) {
          mappedCustomKeys.add(key);
        }
      }
      for (const [key, value] of Object.entries(customAttrs)) {
        if (mappedCustomKeys.has(key)) continue;
        if (value != null && value !== "") {
          snapshotData[key.replace(/\s+/g, "_").toLowerCase()] = value;
        }
      }

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "intercom", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) { console.error(`[Intercom] Snapshot failed for "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Intercom] Imported ${imported} companies for user ${userId}`);
    return { records: imported };
  },

  salesforce: async (apiKey, userId, supabase) => {
    const sepIdx = apiKey.indexOf("|");
    if (sepIdx === -1) throw new Error("Invalid Salesforce credentials. Expected: instanceUrl|accessToken");
    const instanceUrl = apiKey.substring(0, sepIdx).replace(/\/+$/, "");
    const accessToken = apiKey.substring(sepIdx + 1);

    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    const soql = encodeURIComponent(
      `SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees, LastActivityDate, Rating, Website,
        (SELECT Id, Status FROM Cases WHERE Status != 'Closed' LIMIT 200),
        (SELECT Id, CloseDate, Amount FROM Opportunities WHERE StageName = 'Closed Won' ORDER BY CloseDate DESC LIMIT 1)
      FROM Account ORDER BY Name ASC`
    );

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
      url = data.done ? null : (data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null);
    }

    if (allAccounts.length === 0) {
      console.log(`[Salesforce] No accounts found for user ${userId}`);
      return { records: 0 };
    }

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    const companyByName = new Map((existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c]));

    let imported = 0;

    for (const acct of allAccounts) {
      const name = acct.Name?.trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        let email = "";
        try { if (acct.Website) email = `info@${new URL(acct.Website).hostname}`; } catch {}
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry: acct.Industry || "", email })
          .select("id").single();
        if (cErr) { console.error(`[Salesforce] Create failed "${name}":`, cErr.message); continue; }
        companyId = nc.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};

      // MRR (1/6)
      if (acct.AnnualRevenue != null) snapshotData.mrr = Math.round(Number(acct.AnnualRevenue) / 12);

      // NPS (2/6) — Rating as proxy
      const ratingToNps: Record<string, number> = { Hot: 70, Warm: 30, Cold: -20 };
      if (acct.Rating && ratingToNps[acct.Rating] != null) snapshotData.nps = ratingToNps[acct.Rating];

      // lastLogin (3/6)
      if (acct.LastActivityDate) snapshotData.lastLogin = acct.LastActivityDate;

      // supportTickets (4/6) — open Cases
      const openCases = acct.Cases?.records || [];
      snapshotData.supportTickets = openCases.length;

      // contractEnd (5/6) — latest won Opportunity CloseDate
      const wonOpps = acct.Opportunities?.records || [];
      if (wonOpps.length > 0 && wonOpps[0].CloseDate) {
        snapshotData.contractEnd = wonOpps[0].CloseDate;
      }

      // usageScore (6/6) — Rating mapped
      const ratingToUsage: Record<string, number> = { Hot: 90, Warm: 60, Cold: 30 };
      if (acct.Rating) snapshotData.usageScore = ratingToUsage[acct.Rating] || 50;

      // Extras
      if (acct.NumberOfEmployees) snapshotData.employees = Number(acct.NumberOfEmployees);
      if (acct.Rating) snapshotData.rating = acct.Rating;

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "salesforce", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Salesforce] Snapshot failed "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Salesforce] Imported ${imported} accounts for user ${userId}`);
    return { records: imported };
  },

  zendesk: async (apiKey, userId, supabase) => {
    const parts = apiKey.split("|");
    if (parts.length < 3) throw new Error("Invalid Zendesk credentials. Expected: subdomain|email/token|apiToken");
    const [subdomain, emailToken, apiToken] = parts;
    const authHeader = "Basic " + btoa(`${emailToken}:${apiToken}`);
    const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
    const headers = { Authorization: authHeader, "Content-Type": "application/json" };

    const allOrgs: Array<Record<string, any>> = [];
    let url: string | null = `${baseUrl}/organizations.json?page[size]=100`;
    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) { const t = await res.text(); throw new Error(`Zendesk API error ${res.status}: ${t}`); }
      const data = await res.json();
      allOrgs.push(...(data.organizations || []));
      url = data.meta?.has_more ? data.links?.next : null;
    }

    if (allOrgs.length === 0) {
      console.log(`[Zendesk] No organizations found for user ${userId}`);
      return { records: 0 };
    }

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    const companyByName = new Map((existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c]));

    let imported = 0;

    for (const org of allOrgs) {
      const name = org.name?.trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        const industry = org.organization_fields?.industry || "";
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry, email: "" })
          .select("id").single();
        if (cErr) { console.error(`[Zendesk] Create failed "${name}":`, cErr.message); continue; }
        companyId = nc.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};

      // supportTickets (core 4/6)
      try {
        const ticketRes = await fetch(`${baseUrl}/organizations/${org.id}/tickets.json?per_page=1`, { headers });
        if (ticketRes.ok) {
          const td = await ticketRes.json();
          snapshotData.supportTickets = td.count || 0;
        }
      } catch {}

      // lastLogin (core 3/6)
      if (org.updated_at) snapshotData.lastLogin = org.updated_at.split("T")[0];

      // contractEnd (core 5/6) — from custom org fields
      const orgFields = org.organization_fields || {};
      for (const [key, val] of Object.entries(orgFields)) {
        const k = key.toLowerCase().replace(/[\s_-]/g, "");
        if ((k === "contractend" || k === "renewaldate" || k === "contractexpiry") && val) {
          snapshotData.contractEnd = String(val).split("T")[0];
          break;
        }
      }

      // Extras — pass through all org fields
      for (const [key, value] of Object.entries(orgFields)) {
        if (value != null && value !== "" && key !== "industry") {
          const normalizedKey = key.replace(/[\s-]/g, "_").toLowerCase();
          if (!snapshotData[normalizedKey]) snapshotData[normalizedKey] = value;
        }
      }
      if (org.tags?.length) snapshotData.tags = org.tags.join(", ");

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "zendesk", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Zendesk] Snapshot failed "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Zendesk] Imported ${imported} organizations for user ${userId}`);
    return { records: imported };
  },

  pipedrive: async (apiKey, userId, supabase) => {
    const baseUrl = "https://api.pipedrive.com/v1";

    const allOrgs: Array<Record<string, any>> = [];
    let start = 0;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({ api_token: apiKey, start: String(start), limit: "500" });
      const res = await fetch(`${baseUrl}/organizations?${params}`);
      if (!res.ok) { const t = await res.text(); throw new Error(`Pipedrive API error ${res.status}: ${t}`); }
      const data = await res.json();
      if (!data.success) throw new Error("Pipedrive API returned success: false");
      allOrgs.push(...(data.data || []));
      hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
      start = data.additional_data?.pagination?.next_start || start + 500;
    }

    if (allOrgs.length === 0) {
      console.log(`[Pipedrive] No organizations found for user ${userId}`);
      return { records: 0 };
    }

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    const companyByName = new Map((existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c]));

    let imported = 0;

    for (const org of allOrgs) {
      const name = org.name?.trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry: "", email: org.cc_email || "" })
          .select("id").single();
        if (cErr) { console.error(`[Pipedrive] Create failed "${name}":`, cErr.message); continue; }
        companyId = nc.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};

      // MRR (core 1/6) — from won deals value
      if (org.won_deals_count > 0) {
        try {
          const dealsParams = new URLSearchParams({ api_token: apiKey, status: "won", limit: "50" });
          const dealsRes = await fetch(`${baseUrl}/organizations/${org.id}/deals?${dealsParams}`);
          if (dealsRes.ok) {
            const dealsData = await dealsRes.json();
            const totalValue = (dealsData.data || []).reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0);
            if (totalValue > 0) snapshotData.mrr = Math.round(totalValue / 12);
          }
        } catch {}
      }

      // lastLogin (core 3/6)
      if (org.last_activity_date) snapshotData.lastLogin = org.last_activity_date;

      // contractEnd (core 5/6)
      if (org.next_activity_date) snapshotData.contractEnd = org.next_activity_date;

      // usageScore (core 6/6) — activity completion rate
      if (org.activities_count != null && org.done_activities_count != null) {
        const total = Number(org.activities_count);
        const done = Number(org.done_activities_count);
        snapshotData.usageScore = total > 0 ? Math.round((done / total) * 100) : 0;
      }

      // Extras
      if (org.open_deals_count != null) snapshotData.openDeals = Number(org.open_deals_count);
      if (org.won_deals_count != null) snapshotData.wonDeals = Number(org.won_deals_count);
      if (org.lost_deals_count != null) snapshotData.lostDeals = Number(org.lost_deals_count);
      if (org.people_count != null) snapshotData.contacts = Number(org.people_count);

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "pipedrive", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Pipedrive] Snapshot failed "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Pipedrive] Imported ${imported} organizations for user ${userId}`);
    return { records: imported };
  },

  stripe: async (apiKey, userId, supabase) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/x-www-form-urlencoded" };

    const allCustomers: Array<Record<string, any>> = [];
    let startingAfter: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100", "expand[]": "data.subscriptions" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/customers?${params}`, { headers });
      if (!res.ok) { const t = await res.text(); throw new Error(`Stripe API error ${res.status}: ${t}`); }
      const data = await res.json();
      allCustomers.push(...(data.data || []));
      hasMore = data.has_more || false;
      if (data.data?.length) startingAfter = data.data[data.data.length - 1].id;
      else hasMore = false;
    }

    if (allCustomers.length === 0) {
      console.log(`[Stripe] No customers found for user ${userId}`);
      return { records: 0 };
    }

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    const companyByName = new Map((existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c]));

    const calcMrr = (sub: Record<string, any>): number => {
      let total = 0;
      for (const item of sub.items?.data || []) {
        const amt = (item.price?.unit_amount || 0) * (item.quantity || 1);
        const interval = item.price?.recurring?.interval || "month";
        const count = item.price?.recurring?.interval_count || 1;
        switch (interval) {
          case "day": total += (amt / count) * 30; break;
          case "week": total += (amt / count) * 4.33; break;
          case "month": total += amt / count; break;
          case "year": total += amt / (count * 12); break;
          default: total += amt;
        }
      }
      return Math.round(total / 100);
    };

    // Fetch failed invoices for payment failure signal
    const failedInvoices = new Map<string, number>();
    try {
      const invRes = await fetch(`https://api.stripe.com/v1/invoices?status=open&limit=100`, { headers });
      if (invRes.ok) {
        const invData = await invRes.json();
        for (const inv of invData.data || []) {
          if (inv.customer && inv.attempt_count > 0) {
            failedInvoices.set(inv.customer, (failedInvoices.get(inv.customer) || 0) + 1);
          }
        }
      }
    } catch {}

    let imported = 0;

    for (const cust of allCustomers) {
      const name = (cust.name || cust.email || "").trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry: cust.metadata?.industry || "", email: cust.email || "" })
          .select("id").single();
        if (cErr) { console.error(`[Stripe] Create failed "${name}":`, cErr.message); continue; }
        companyId = nc.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};
      const activeSubs = (cust.subscriptions?.data || []).filter((s: any) => s.status === "active" || s.status === "trialing");

      // MRR (core 1/6)
      let totalMrr = 0;
      let latestEnd: string | null = null;
      for (const sub of activeSubs) {
        totalMrr += calcMrr(sub);
        if (sub.current_period_end) {
          const end = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];
          if (!latestEnd || end > latestEnd) latestEnd = end;
        }
      }
      snapshotData.mrr = totalMrr;

      // contractEnd (core 5/6)
      if (latestEnd) snapshotData.contractEnd = latestEnd;

      // Extras
      snapshotData.activeSubscriptions = activeSubs.length;
      const canceledSubs = (cust.subscriptions?.data || []).filter((s: any) => s.status === "canceled").length;
      if (canceledSubs > 0) snapshotData.canceledSubscriptions = canceledSubs;

      const failures = failedInvoices.get(cust.id) || 0;
      if (failures > 0) snapshotData.paymentFailures = failures;

      if (cust.metadata?.plan) snapshotData.plan = cust.metadata.plan;
      else if (activeSubs.length > 0 && activeSubs[0].items?.data?.[0]?.price?.nickname) {
        snapshotData.plan = activeSubs[0].items.data[0].price.nickname;
      }

      for (const [key, value] of Object.entries(cust.metadata || {})) {
        if (value && !snapshotData[key] && key !== "industry") snapshotData[key] = value;
      }

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "stripe", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Stripe] Snapshot failed "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Stripe] Imported ${imported} customers for user ${userId}`);
    return { records: imported };
  },

  segment: async (apiKey, userId, supabase) => {
    const sepIdx = apiKey.indexOf("|");
    if (sepIdx === -1) throw new Error("Invalid Segment credentials. Expected: spaceId|accessToken");
    const spaceId = apiKey.substring(0, sepIdx);
    const accessToken = apiKey.substring(sepIdx + 1);

    const baseUrl = `https://profiles.segment.com/v1/spaces/${spaceId}/collections/accounts/profiles`;
    const headers = { Authorization: "Basic " + btoa(`${accessToken}:`), "Content-Type": "application/json" };

    const allProfiles: Array<Record<string, any>> = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100", include: "traits" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (res.status === 404) throw new Error("Segment Profile API 404. Ensure Unify is enabled and Space ID is correct.");
      if (res.status === 401 || res.status === 403) throw new Error("Segment auth failed. Check your Profile API Access Token.");
      if (!res.ok) { const t = await res.text(); throw new Error(`Segment API error ${res.status}: ${t}`); }
      const data = await res.json();
      allProfiles.push(...(data.data || []));
      hasMore = data.cursor?.has_more || false;
      cursor = data.cursor?.next;
    }

    if (allProfiles.length === 0) {
      console.log(`[Segment] No account profiles found for user ${userId}`);
      return { records: 0 };
    }

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    const companyByName = new Map((existingCompanies || []).map((c: any) => [c.name.toLowerCase().trim(), c]));

    const TRAIT_MAP: Record<string, string> = {
      mrr: "mrr", monthly_recurring_revenue: "mrr", revenue: "mrr",
      nps: "nps", nps_score: "nps", net_promoter_score: "nps",
      last_seen: "lastLogin", last_active: "lastLogin", last_login: "lastLogin", last_activity: "lastLogin",
      support_tickets: "supportTickets", open_tickets: "supportTickets", ticket_count: "supportTickets",
      contract_end: "contractEnd", renewal_date: "contractEnd", contract_renewal: "contractEnd", contract_expiry: "contractEnd",
      usage_score: "usageScore", health_score: "usageScore", engagement_score: "usageScore", engagement: "usageScore",
    };

    const COMPANY_KEYS = new Set(["name", "company_name", "industry", "email"]);

    let imported = 0;

    for (const profile of allProfiles) {
      const traits = profile.traits || {};
      const name = (traits.name || traits.company_name || "").trim();
      if (!name) continue;

      let companyId: string;
      const existing = companyByName.get(name.toLowerCase());

      if (existing) {
        companyId = existing.id;
      } else {
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name, industry: traits.industry || "", email: traits.email || "" })
          .select("id").single();
        if (cErr) { console.error(`[Segment] Create failed "${name}":`, cErr.message); continue; }
        companyId = nc.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      const snapshotData: Record<string, any> = {};

      for (const [key, value] of Object.entries(traits)) {
        if (COMPANY_KEYS.has(key)) continue;
        if (value == null || value === "") continue;

        const normalized = key.toLowerCase().replace(/[\s-]/g, "_");
        const mapped = TRAIT_MAP[normalized];

        if (mapped) {
          if (mapped === "lastLogin" || mapped === "contractEnd") {
            snapshotData[mapped] = String(value).split("T")[0];
          } else {
            snapshotData[mapped] = Number(value) || 0;
          }
        } else {
          const numVal = Number(value);
          snapshotData[normalized] = isNaN(numVal) ? value : numVal;
        }
      }

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "segment", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Segment] Snapshot failed "${name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Segment] Imported ${imported} profiles for user ${userId}`);
    return { records: imported };
  },

  slack: async (apiKey, userId, supabase) => {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    const allChannels: Array<Record<string, any>> = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ types: "public_channel,private_channel", limit: "200", exclude_archived: "true" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, { headers });
      if (!res.ok) throw new Error(`Slack HTTP error ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(`Slack API error: ${data.error || "unknown"}`);
      allChannels.push(...(data.channels || []));
      cursor = data.response_metadata?.next_cursor || undefined;
      if (cursor === "") cursor = undefined;
    } while (cursor);

    const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
    if (!existingCompanies?.length) {
      console.log(`[Slack] No existing companies to match for user ${userId}`);
      return { records: 0 };
    }

    const companyByNormalized = new Map<string, { id: string; name: string }>();
    for (const c of existingCompanies) companyByNormalized.set(c.name.toLowerCase().replace(/[^a-z0-9]/g, ""), c);

    const pairs: Array<{ channel: Record<string, any>; company: { id: string; name: string } }> = [];
    for (const ch of allChannels) {
      const chNorm = ch.name.toLowerCase().replace(/^(customer-|shared-|client-|ext-)/, "").replace(/[^a-z0-9]/g, "");
      for (const [compNorm, company] of companyByNormalized) {
        if (chNorm.includes(compNorm) || compNorm.includes(chNorm)) {
          pairs.push({ channel: ch, company });
          break;
        }
      }
    }

    if (pairs.length === 0) {
      console.log(`[Slack] No channels matched to companies for user ${userId}`);
      return { records: 0 };
    }

    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    let imported = 0;

    for (const { channel, company } of pairs) {
      let messageCount = 0;
      const uniqueUsers = new Set<string>();
      let latestTs: number | null = null;

      try {
        const hParams = new URLSearchParams({ channel: channel.id, limit: "200", oldest: String(sevenDaysAgo) });
        const hRes = await fetch(`https://slack.com/api/conversations.history?${hParams}`, { headers });
        if (hRes.ok) {
          const hData = await hRes.json();
          if (hData.ok) {
            const msgs = (hData.messages || []).filter((m: any) => m.type === "message" && !m.subtype);
            messageCount = msgs.length;
            for (const m of msgs) {
              if (m.user) uniqueUsers.add(m.user);
              const ts = parseFloat(m.ts);
              if (!latestTs || ts > latestTs) latestTs = ts;
            }
          }
        }
      } catch {}

      const snapshotData: Record<string, any> = {
        slackMessages7d: messageCount,
        slackActiveUsers7d: uniqueUsers.size,
        slackChannelMembers: channel.num_members || 0,
        slackChannel: `#${channel.name}`,
      };

      // lastLogin (core 3/6)
      if (latestTs) snapshotData.lastLogin = new Date(latestTs * 1000).toISOString().split("T")[0];

      // usageScore (core 6/6) — 4-tier bucketing
      if (messageCount === 0) snapshotData.usageScore = 0;
      else if (messageCount <= 5) snapshotData.usageScore = 25;
      else if (messageCount <= 15) snapshotData.usageScore = 50;
      else if (messageCount <= 40) snapshotData.usageScore = 75;
      else snapshotData.usageScore = 95;

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: company.id, user_id: userId, source: "slack", data: snapshotData },
          { onConflict: "company_id,snapshot_date" }
        );
      if (sErr) { console.error(`[Slack] Snapshot failed "${company.name}":`, sErr.message); continue; }
      imported++;
    }

    console.log(`[Slack] Enriched ${imported} companies for user ${userId}`);
    return { records: imported };
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
