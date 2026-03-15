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
  pipedrive: async (apiKey, userId, supabase) => {
    const baseUrl = "https://api.pipedrive.com/v1/organizations";

    // 1. Paginate through all Pipedrive organizations
    const allOrgs: Array<Record<string, any>> = [];
    let start = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        api_token: apiKey,
        start: String(start),
        limit: String(limit),
      });

      const res = await fetch(`${baseUrl}?${params}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pipedrive API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(`Pipedrive API returned success: false`);
      }

      allOrgs.push(...(data.data || []));
      hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
      start = data.additional_data?.pagination?.next_start || start + limit;
    }

    if (allOrgs.length === 0) {
      console.log(`[Pipedrive] No organizations found for user ${userId}`);
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

    // 3. Process each Pipedrive organization
    for (const org of allOrgs) {
      const name = org.name?.trim();
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
            industry: "",
            email: org.cc_email || "",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Pipedrive] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Build snapshot data from Pipedrive fields
      const snapshotData: Record<string, any> = {};

      if (org.open_deals_count != null) {
        snapshotData.openDeals = Number(org.open_deals_count);
      }
      if (org.won_deals_count != null) {
        snapshotData.wonDeals = Number(org.won_deals_count);
      }
      if (org.lost_deals_count != null) {
        snapshotData.lostDeals = Number(org.lost_deals_count);
      }
      if (org.people_count != null) {
        snapshotData.contacts = Number(org.people_count);
      }
      if (org.last_activity_date) {
        snapshotData.lastLogin = org.last_activity_date;
      }
      if (org.next_activity_date) {
        snapshotData.nextActivity = org.next_activity_date;
      }
      if (org.activities_count != null && org.done_activities_count != null) {
        const total = Number(org.activities_count);
        const done = Number(org.done_activities_count);
        snapshotData.usageScore = total > 0 ? Math.round((done / total) * 100) : 0;
      }

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            source: "pipedrive",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Pipedrive] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Pipedrive] Imported ${imported} organizations for user ${userId}`);
    return { records: imported };
  },
  stripe: async (apiKey, userId, supabase) => {
    const baseUrl = "https://api.stripe.com/v1/customers";
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // 1. Paginate through all Stripe customers
    const allCustomers: Array<Record<string, any>> = [];
    let startingAfter: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: "100",
        "expand[]": "data.subscriptions",
      });
      if (startingAfter) params.set("starting_after", startingAfter);

      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Stripe API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const customers = data.data || [];
      allCustomers.push(...customers);

      hasMore = data.has_more || false;
      if (customers.length > 0) {
        startingAfter = customers[customers.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    if (allCustomers.length === 0) {
      console.log(`[Stripe] No customers found for user ${userId}`);
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

    // Helper: calculate MRR from a Stripe subscription
    const calcMrr = (subscription: Record<string, any>): number => {
      let totalMonthly = 0;
      const items = subscription.items?.data || [];
      for (const item of items) {
        const unitAmount = item.price?.unit_amount || 0;
        const quantity = item.quantity || 1;
        const interval = item.price?.recurring?.interval || "month";
        const intervalCount = item.price?.recurring?.interval_count || 1;
        const lineTotal = unitAmount * quantity;

        switch (interval) {
          case "day":
            totalMonthly += (lineTotal / intervalCount) * 30;
            break;
          case "week":
            totalMonthly += (lineTotal / intervalCount) * 4.33;
            break;
          case "month":
            totalMonthly += lineTotal / intervalCount;
            break;
          case "year":
            totalMonthly += lineTotal / (intervalCount * 12);
            break;
          default:
            totalMonthly += lineTotal;
        }
      }
      return Math.round(totalMonthly / 100);
    };

    // 3. Process each Stripe customer
    for (const customer of allCustomers) {
      const name = (customer.name || customer.email || "").trim();
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
            industry: customer.metadata?.industry || "",
            email: customer.email || "",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Stripe] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Build snapshot data
      const snapshotData: Record<string, any> = {};

      const activeSubs = (customer.subscriptions?.data || []).filter(
        (s: Record<string, any>) => s.status === "active" || s.status === "trialing"
      );

      let totalMrr = 0;
      let contractEnd: string | null = null;

      for (const sub of activeSubs) {
        totalMrr += calcMrr(sub);
        if (sub.current_period_end) {
          const endDate = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];
          if (!contractEnd || endDate > contractEnd) {
            contractEnd = endDate;
          }
        }
      }

      snapshotData.mrr = totalMrr;
      if (contractEnd) snapshotData.contractEnd = contractEnd;
      snapshotData.activeSubscriptions = activeSubs.length;
      snapshotData.totalSubscriptions = (customer.subscriptions?.data || []).length;

      if (customer.metadata?.plan) {
        snapshotData.plan = customer.metadata.plan;
      }

      if (customer.metadata) {
        for (const [key, value] of Object.entries(customer.metadata)) {
          if (value && key !== "industry" && key !== "plan" && !snapshotData[key]) {
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
            source: "stripe",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Stripe] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Stripe] Imported ${imported} customers for user ${userId}`);
    return { records: imported };
  },
  segment: async (apiKey, userId, supabase) => {
    // Parse credentials: spaceId|accessToken
    const separatorIndex = apiKey.indexOf("|");
    if (separatorIndex === -1) {
      throw new Error("Invalid Segment credentials. Expected format: spaceId|accessToken");
    }
    const spaceId = apiKey.substring(0, separatorIndex);
    const accessToken = apiKey.substring(separatorIndex + 1);

    const baseUrl = `https://profiles.segment.com/v1/spaces/${spaceId}/collections/accounts/profiles`;
    const authHeader = "Basic " + btoa(`${accessToken}:`);
    const headers = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };

    // 1. Paginate through all Segment account profiles
    const allProfiles: Array<Record<string, any>> = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100", include: "traits" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${baseUrl}?${params}`, { headers });

      if (res.status === 404) {
        throw new Error(
          "Segment Profile API returned 404. Ensure you have Segment Unify enabled and the Space ID is correct."
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error("Segment authentication failed. Check your Profile API Access Token.");
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Segment API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      allProfiles.push(...(data.data || []));
      hasMore = data.cursor?.has_more || false;
      cursor = data.cursor?.next;
    }

    if (allProfiles.length === 0) {
      console.log(`[Segment] No account profiles found for user ${userId}`);
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

    // 3. Process each Segment account profile
    for (const profile of allProfiles) {
      const traits = profile.traits || {};
      const name = (traits.name || traits.company_name || "").trim();
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
            industry: traits.industry || "",
            email: traits.email || "",
          })
          .select("id")
          .single();

        if (cErr) {
          console.error(`[Segment] Failed to create company "${name}":`, cErr.message);
          continue;
        }
        companyId = newCompany.id;
        companyByName.set(name.toLowerCase(), { id: companyId, name });
      }

      // Build snapshot data from Segment traits
      const snapshotData: Record<string, any> = {};
      const knownCompanyKeys = new Set(["name", "company_name", "industry", "email"]);

      for (const [key, value] of Object.entries(traits)) {
        if (knownCompanyKeys.has(key)) continue;
        if (value == null || value === "") continue;

        const keyLower = key.toLowerCase();
        if (keyLower === "mrr" || keyLower === "monthly_recurring_revenue") {
          snapshotData.mrr = Number(value);
        } else if (keyLower === "nps" || keyLower === "nps_score" || keyLower === "net_promoter_score") {
          snapshotData.nps = Number(value);
        } else if (keyLower === "last_seen" || keyLower === "last_active" || keyLower === "last_login") {
          snapshotData.lastLogin = String(value).split("T")[0];
        } else if (keyLower === "usage_score" || keyLower === "health_score" || keyLower === "engagement_score") {
          snapshotData.usageScore = Number(value);
        } else if (keyLower === "support_tickets" || keyLower === "open_tickets") {
          snapshotData.supportTickets = Number(value);
        } else if (keyLower === "contract_end" || keyLower === "renewal_date") {
          snapshotData.contractEnd = String(value).split("T")[0];
        } else {
          const normalizedKey = key.replace(/\s+/g, "_").toLowerCase();
          const numVal = Number(value);
          snapshotData[normalizedKey] = isNaN(numVal) ? value : numVal;
        }
      }

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: companyId,
            user_id: userId,
            source: "segment",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Segment] Failed to upsert snapshot for "${name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Segment] Imported ${imported} account profiles for user ${userId}`);
    return { records: imported };
  },
  slack: async (apiKey, userId, supabase) => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // 1. Fetch all non-archived channels
    const allChannels: Array<Record<string, any>> = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        limit: "200",
        exclude_archived: "true",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, { headers });
      if (!res.ok) {
        throw new Error(`Slack API HTTP error ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error || "unknown"}`);
      }

      allChannels.push(...(data.channels || []));
      cursor = data.response_metadata?.next_cursor || undefined;
      if (cursor === "") cursor = undefined;
    } while (cursor);

    if (allChannels.length === 0) {
      console.log(`[Slack] No channels found for user ${userId}`);
      return { records: 0 };
    }

    // 2. Match channels to existing companies (enrichment-only, no creation)
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);

    if (!existingCompanies || existingCompanies.length === 0) {
      console.log(`[Slack] No existing companies to match channels against for user ${userId}`);
      return { records: 0 };
    }

    const companyByNormalized = new Map<string, { id: string; name: string }>();
    for (const c of existingCompanies) {
      const normalized = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      companyByNormalized.set(normalized, c);
    }

    const channelCompanyPairs: Array<{
      channel: Record<string, any>;
      company: { id: string; name: string };
    }> = [];

    for (const channel of allChannels) {
      const channelNormalized = channel.name
        .toLowerCase()
        .replace(/^(customer-|shared-|client-|ext-)/, "")
        .replace(/[^a-z0-9]/g, "");

      for (const [companyNormalized, company] of companyByNormalized) {
        if (
          channelNormalized.includes(companyNormalized) ||
          companyNormalized.includes(channelNormalized)
        ) {
          channelCompanyPairs.push({ channel, company });
          break;
        }
      }
    }

    if (channelCompanyPairs.length === 0) {
      console.log(`[Slack] No channels matched to existing companies for user ${userId}`);
      return { records: 0 };
    }

    // 3. Fetch recent activity for matched channels (last 7 days)
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    let imported = 0;

    for (const { channel, company } of channelCompanyPairs) {
      let messageCount = 0;
      const uniqueUsers = new Set<string>();
      let latestMessageTs: number | null = null;

      try {
        const historyParams = new URLSearchParams({
          channel: channel.id,
          limit: "100",
          oldest: String(sevenDaysAgo),
        });

        const histRes = await fetch(
          `https://slack.com/api/conversations.history?${historyParams}`,
          { headers }
        );

        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData.ok) {
            const messages = (histData.messages || []).filter(
              (m: Record<string, any>) => m.type === "message" && !m.subtype
            );
            messageCount = messages.length;
            for (const m of messages) {
              if (m.user) uniqueUsers.add(m.user);
              const ts = parseFloat(m.ts);
              if (!latestMessageTs || ts > latestMessageTs) {
                latestMessageTs = ts;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Slack] Failed to fetch history for #${channel.name}:`, err);
      }

      // Build snapshot data
      const snapshotData: Record<string, any> = {
        slackMessages7d: messageCount,
        slackActiveUsers7d: uniqueUsers.size,
        slackChannelMembers: channel.num_members || 0,
        slackChannel: `#${channel.name}`,
      };

      if (latestMessageTs) {
        snapshotData.lastLogin = new Date(latestMessageTs * 1000).toISOString().split("T")[0];
      }

      // Engagement score from 7-day message count
      if (messageCount === 0) snapshotData.usageScore = 0;
      else if (messageCount <= 5) snapshotData.usageScore = 30;
      else if (messageCount <= 15) snapshotData.usageScore = 60;
      else snapshotData.usageScore = 90;

      // Upsert snapshot
      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          {
            company_id: company.id,
            user_id: userId,
            source: "slack",
            data: snapshotData,
          },
          { onConflict: "company_id,snapshot_date" }
        );

      if (sErr) {
        console.error(`[Slack] Failed to upsert snapshot for "${company.name}":`, sErr.message);
        continue;
      }
      imported++;
    }

    console.log(`[Slack] Enriched ${imported} companies with Slack activity for user ${userId}`);
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
