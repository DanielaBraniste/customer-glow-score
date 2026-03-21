import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 500;

// Helper: fetch with a timeout (default 15s) so stalled requests fail fast
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to ${url.split("?")[0]} timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Cursor is a JSON string: { apiCursor: string, fetched: number }
interface ImportCursor {
  apiCursor?: string; // API-level pagination cursor
  offset?: number;    // For offset-based APIs (Pipedrive)
}

function parseCursor(raw: string | null | undefined): ImportCursor {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

// Each handler now: fetches up to BATCH_SIZE items from the API (using cursor),
// processes them, and returns { records, nextCursor? }
type HandlerResult = { records: number; nextCursor?: string };
type Handler = (apiKey: string, userId: string, supabase: ReturnType<typeof createClient>, cursor: ImportCursor) => Promise<HandlerResult>;

// ---------- Shared helper: load existing companies for a user ----------
async function loadCompanyMap(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("companies").select("id, name").eq("user_id", userId);
  return new Map((data || []).map((c: any) => [c.name.toLowerCase().trim(), c]));
}

async function upsertCompanySnapshot(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  source: string,
  snapshotData: Record<string, any>,
  selectedFields?: string[] | null,
) {
  // Filter snapshot data to only include selected fields (if specified)
  let filteredData = snapshotData;
  if (selectedFields && selectedFields.length > 0) {
    filteredData = {};
    for (const key of selectedFields) {
      if (key in snapshotData) filteredData[key] = snapshotData[key];
    }
  }
  const { error } = await supabase
    .from("company_snapshots")
    .upsert(
      { company_id: companyId, user_id: userId, source, data: filteredData },
      { onConflict: "company_id,snapshot_date" }
    );
  return error;
}

async function ensureCompany(
  supabase: ReturnType<typeof createClient>,
  companyByName: Map<string, any>,
  userId: string,
  name: string,
  extra: { industry?: string; email?: string } = {},
): Promise<string | null> {
  const existing = companyByName.get(name.toLowerCase().trim());
  if (existing) return existing.id;

  const { data: nc, error } = await supabase
    .from("companies")
    .insert({ user_id: userId, name, industry: extra.industry || "", email: extra.email || "" })
    .select("id")
    .single();
  if (error) return null;
  companyByName.set(name.toLowerCase().trim(), { id: nc.id, name });
  return nc.id;
}

// ======================= HUBSPOT =======================
const hubspotHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const properties = [
    "name", "industry", "domain", "annualrevenue",
    "notes_last_updated", "hs_last_sales_activity_timestamp", "hs_lastmodifieddate",
    "num_associated_deals", "hs_num_open_deals",
    "hs_lead_status", "lifecyclestage",
    "hs_analytics_num_visits", "hs_analytics_num_page_views",
    "hs_feedback_last_nps_rating", "hs_feedback_last_nps_follow_up",
    "closedate", "hs_date_entered_customer", "num_associated_contacts",
  ].join(",");

  const baseUrl = "https://api.hubapi.com/crm/v3/objects/companies";
  const batch: Array<{ id: string; properties: Record<string, string | null> }> = [];
  let after: string | undefined = cursor.apiCursor;
  let nextAfter: string | undefined;

  // Fetch pages until we have BATCH_SIZE items
  do {
    const params = new URLSearchParams({ limit: "100", properties });
    if (after) params.set("after", after);
    console.log(`[HubSpot] Fetching page (after=${after || "start"}, have=${batch.length})…`);
    const res = await fetchWithTimeout(`${baseUrl}?${params}`, { headers, timeout: 15000 });
    if (!res.ok) { const body = await res.text(); throw new Error(`HubSpot API error ${res.status}: ${body}`); }
    const data = await res.json();
    batch.push(...(data.results || []));
    nextAfter = data.paging?.next?.after;
    after = nextAfter;
  } while (after && batch.length < BATCH_SIZE);

  if (batch.length === 0) return { records: 0 };

  // Batch-fetch ticket associations
  const ticketCounts = new Map<string, number>();
  const ASSOC_BATCH = 100;
  for (let i = 0; i < batch.length; i += ASSOC_BATCH) {
    const ids = batch.slice(i, i + ASSOC_BATCH).map((c) => c.id);
    try {
      const assocRes = await fetchWithTimeout(
        "https://api.hubapi.com/crm/v3/associations/companies/tickets/batch/read",
        { method: "POST", timeout: 15000, headers, body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
      );
      if (assocRes.ok) {
        const assocData = await assocRes.json();
        for (const result of assocData.results || []) {
          ticketCounts.set(result.from.id, (result.to || []).length);
        }
      }
    } catch (err) { console.warn("[HubSpot] Ticket assoc fetch failed, continuing:", err); }
  }

  const companyByName = await loadCompanyMap(supabase, userId);
  let imported = 0;

  for (const hc of batch) {
    const name = hc.properties.name?.trim();
    if (!name) continue;
    const companyId = await ensureCompany(supabase, companyByName, userId, name, {
      industry: hc.properties.industry || "", email: hc.properties.domain ? `info@${hc.properties.domain}` : "",
    });
    if (!companyId) continue;

    const p = hc.properties;
    const sd: Record<string, any> = {};
    if (p.annualrevenue) sd.mrr = Math.round(Number(p.annualrevenue) / 12);
    if (p.hs_feedback_last_nps_rating != null) sd.nps = Number(p.hs_feedback_last_nps_rating);
    const actDate = p.hs_last_sales_activity_timestamp || p.notes_last_updated || p.hs_lastmodifieddate;
    if (actDate) sd.lastLogin = actDate.split("T")[0];
    const tickets = ticketCounts.get(hc.id);
    if (tickets != null) sd.supportTickets = tickets;
    if (p.closedate) sd.contractEnd = p.closedate.split("T")[0];
    if (p.hs_analytics_num_visits) sd.usageScore = Math.min(100, Math.round((Number(p.hs_analytics_num_visits) / 500) * 100));
    if (p.num_associated_deals) sd.deals = Number(p.num_associated_deals);
    if (p.hs_num_open_deals) sd.openDeals = Number(p.hs_num_open_deals);
    if (p.hs_lead_status) sd.leadStatus = p.hs_lead_status;
    if (p.lifecyclestage) sd.lifecycleStage = p.lifecyclestage;
    if (p.hs_analytics_num_page_views) sd.pageViews = Number(p.hs_analytics_num_page_views);

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "hubspot", sd);
    if (sErr) { console.error(`[HubSpot] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[HubSpot] Batch done: imported ${imported}, hasMore=${!!nextAfter}`);
  return { records: imported, nextCursor: nextAfter ? JSON.stringify({ apiCursor: nextAfter }) : undefined };
};

// ======================= INTERCOM =======================
const intercomHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", "Intercom-Version": "2.11" };

  const batch: Array<Record<string, any>> = [];
  let startingAfter: string | undefined = cursor.apiCursor;
  let nextStartingAfter: string | undefined;

  do {
    const body: Record<string, any> = { per_page: 50 };
    if (startingAfter) body.starting_after = startingAfter;
    const res = await fetchWithTimeout("https://api.intercom.io/companies/list", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text(); throw new Error(`Intercom API error ${res.status}: ${t}`); }
    const data = await res.json();
    batch.push(...(data.data || []));
    nextStartingAfter = data.pages?.next?.starting_after || undefined;
    startingAfter = nextStartingAfter;
  } while (startingAfter && batch.length < BATCH_SIZE);

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);
  let imported = 0;

  for (const ic of batch) {
    const name = ic.name?.trim();
    if (!name) continue;
    const companyId = await ensureCompany(supabase, companyByName, userId, name, { industry: ic.industry || "" });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    const customAttrs = ic.custom_attributes || {};

    if (ic.monthly_spend != null) sd.mrr = Number(ic.monthly_spend);

    for (const [key, val] of Object.entries(customAttrs)) {
      const k = key.toLowerCase().replace(/[\s_-]/g, "");
      if ((k === "nps" || k === "npsscore" || k === "netpromoterscore") && val != null) { sd.nps = Number(val); break; }
    }

    if (ic.last_request_at) sd.lastLogin = new Date(ic.last_request_at * 1000).toISOString().split("T")[0];

    // supportTickets — skip per-company conversation search in batched mode for speed
    // We only do a lightweight count if feasible
    try {
      const convRes = await fetchWithTimeout("https://api.intercom.io/conversations/search", {
        method: "POST", headers,
        body: JSON.stringify({ query: { operator: "AND", value: [{ field: "company_id", operator: "=", value: ic.company_id || ic.id }, { field: "open", operator: "=", value: true }] }, pagination: { per_page: 1 } }),
      });
      if (convRes.ok) { const cd = await convRes.json(); sd.supportTickets = cd.total_count ?? (cd.conversations?.length || 0); }
    } catch {}

    for (const [key, val] of Object.entries(customAttrs)) {
      const k = key.toLowerCase().replace(/[\s_-]/g, "");
      if ((k === "contractend" || k === "renewaldate" || k === "contractrenewal" || k === "contractexpiry") && val) { sd.contractEnd = String(val).split("T")[0]; break; }
    }

    if (ic.session_count != null) sd.usageScore = Math.min(100, Math.round((Number(ic.session_count) / 300) * 100));
    if (ic.user_count != null) sd.activeUsers = Number(ic.user_count);
    if (ic.plan?.name) sd.plan = ic.plan.name;

    const mappedCustomKeys = new Set<string>();
    for (const [key] of Object.entries(customAttrs)) {
      const k = key.toLowerCase().replace(/[\s_-]/g, "");
      if (["nps", "npsscore", "netpromoterscore", "contractend", "renewaldate", "contractrenewal", "contractexpiry"].includes(k)) mappedCustomKeys.add(key);
    }
    for (const [key, value] of Object.entries(customAttrs)) {
      if (mappedCustomKeys.has(key)) continue;
      if (value != null && value !== "") sd[key.replace(/\s+/g, "_").toLowerCase()] = value;
    }

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "intercom", sd);
    if (sErr) { console.error(`[Intercom] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Intercom] Batch done: imported ${imported}, hasMore=${!!nextStartingAfter}`);
  return { records: imported, nextCursor: nextStartingAfter ? JSON.stringify({ apiCursor: nextStartingAfter }) : undefined };
};

// ======================= SALESFORCE =======================
const salesforceHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const sepIdx = apiKey.indexOf("|");
  if (sepIdx === -1) throw new Error("Invalid Salesforce credentials. Expected: instanceUrl|accessToken");
  const instanceUrl = apiKey.substring(0, sepIdx).replace(/\/+$/, "");
  const accessToken = apiKey.substring(sepIdx + 1);
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  const batch: Array<Record<string, any>> = [];
  let url: string | null;

  if (cursor.apiCursor) {
    // Resume from nextRecordsUrl
    url = `${instanceUrl}${cursor.apiCursor}`;
  } else {
    const soql = encodeURIComponent(
      `SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees, LastActivityDate, Rating, Website,
        (SELECT Id, Status FROM Cases WHERE Status != 'Closed' LIMIT 200),
        (SELECT Id, CloseDate, Amount FROM Opportunities WHERE StageName = 'Closed Won' ORDER BY CloseDate DESC LIMIT 1)
      FROM Account ORDER BY Name ASC`
    );
    url = `${instanceUrl}/services/data/v59.0/query?q=${soql}`;
  }

  let nextRecordsUrl: string | null = null;

  while (url && batch.length < BATCH_SIZE) {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) { const t = await res.text(); throw new Error(`Salesforce API error ${res.status}: ${t}`); }
    const data = await res.json();
    batch.push(...(data.records || []));
    if (data.done || !data.nextRecordsUrl) { url = null; nextRecordsUrl = null; }
    else { nextRecordsUrl = data.nextRecordsUrl; url = `${instanceUrl}${data.nextRecordsUrl}`; }
  }

  // If we exceeded BATCH_SIZE mid-page, still have more
  if (batch.length >= BATCH_SIZE && nextRecordsUrl) {
    // We'll resume from nextRecordsUrl
  }

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);
  let imported = 0;

  for (const acct of batch) {
    const name = acct.Name?.trim();
    if (!name) continue;
    let email = "";
    try { if (acct.Website) email = `info@${new URL(acct.Website).hostname}`; } catch {}
    const companyId = await ensureCompany(supabase, companyByName, userId, name, { industry: acct.Industry || "", email });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    if (acct.AnnualRevenue != null) sd.mrr = Math.round(Number(acct.AnnualRevenue) / 12);
    const ratingToNps: Record<string, number> = { Hot: 70, Warm: 30, Cold: -20 };
    if (acct.Rating && ratingToNps[acct.Rating] != null) sd.nps = ratingToNps[acct.Rating];
    if (acct.LastActivityDate) sd.lastLogin = acct.LastActivityDate;
    sd.supportTickets = (acct.Cases?.records || []).length;
    const wonOpps = acct.Opportunities?.records || [];
    if (wonOpps.length > 0 && wonOpps[0].CloseDate) sd.contractEnd = wonOpps[0].CloseDate;
    const ratingToUsage: Record<string, number> = { Hot: 90, Warm: 60, Cold: 30 };
    if (acct.Rating) sd.usageScore = ratingToUsage[acct.Rating] || 50;
    if (acct.NumberOfEmployees) sd.employees = Number(acct.NumberOfEmployees);
    if (acct.Rating) sd.rating = acct.Rating;

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "salesforce", sd);
    if (sErr) { console.error(`[Salesforce] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Salesforce] Batch done: imported ${imported}, hasMore=${!!nextRecordsUrl}`);
  return { records: imported, nextCursor: nextRecordsUrl ? JSON.stringify({ apiCursor: nextRecordsUrl }) : undefined };
};

// ======================= ZENDESK =======================
const zendeskHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const parts = apiKey.split("|");
  if (parts.length < 3) throw new Error("Invalid Zendesk credentials. Expected: subdomain|email/token|apiToken");
  const [subdomain, emailToken, apiToken] = parts;
  const authHeader = "Basic " + btoa(`${emailToken}:${apiToken}`);
  const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
  const headers = { Authorization: authHeader, "Content-Type": "application/json" };

  const batch: Array<Record<string, any>> = [];
  let url: string | null = cursor.apiCursor
    ? `${baseUrl}/organizations.json?page[size]=100&page[after]=${cursor.apiCursor}`
    : `${baseUrl}/organizations.json?page[size]=100`;
  let nextCursorValue: string | undefined;

  while (url && batch.length < BATCH_SIZE) {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) { const t = await res.text(); throw new Error(`Zendesk API error ${res.status}: ${t}`); }
    const data = await res.json();
    batch.push(...(data.organizations || []));
    if (data.meta?.has_more && data.meta?.after_cursor) {
      nextCursorValue = data.meta.after_cursor;
      url = data.links?.next || null;
    } else {
      nextCursorValue = undefined;
      url = null;
    }
  }

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);
  let imported = 0;

  for (const org of batch) {
    const name = org.name?.trim();
    if (!name) continue;
    const industry = org.organization_fields?.industry || "";
    const companyId = await ensureCompany(supabase, companyByName, userId, name, { industry });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    try {
      const ticketRes = await fetchWithTimeout(`${baseUrl}/organizations/${org.id}/tickets.json?per_page=1`, { headers });
      if (ticketRes.ok) { const td = await ticketRes.json(); sd.supportTickets = td.count || 0; }
    } catch {}
    if (org.updated_at) sd.lastLogin = org.updated_at.split("T")[0];
    const orgFields = org.organization_fields || {};
    for (const [key, val] of Object.entries(orgFields)) {
      const k = key.toLowerCase().replace(/[\s_-]/g, "");
      if ((k === "contractend" || k === "renewaldate" || k === "contractexpiry") && val) { sd.contractEnd = String(val).split("T")[0]; break; }
    }
    for (const [key, value] of Object.entries(orgFields)) {
      if (value != null && value !== "" && key !== "industry") {
        const nk = key.replace(/[\s-]/g, "_").toLowerCase();
        if (!sd[nk]) sd[nk] = value;
      }
    }
    if (org.tags?.length) sd.tags = org.tags.join(", ");

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "zendesk", sd);
    if (sErr) { console.error(`[Zendesk] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Zendesk] Batch done: imported ${imported}, hasMore=${!!nextCursorValue}`);
  return { records: imported, nextCursor: nextCursorValue ? JSON.stringify({ apiCursor: nextCursorValue }) : undefined };
};

// ======================= PIPEDRIVE =======================
const pipedriveHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const baseUrl = "https://api.pipedrive.com/v1";
  let start = cursor.offset || 0;

  const batch: Array<Record<string, any>> = [];
  let hasMore = true;
  let nextStart = start;

  while (hasMore && batch.length < BATCH_SIZE) {
    const params = new URLSearchParams({ api_token: apiKey, start: String(nextStart), limit: "500" });
    const res = await fetchWithTimeout(`${baseUrl}/organizations?${params}`);
    if (!res.ok) { const t = await res.text(); throw new Error(`Pipedrive API error ${res.status}: ${t}`); }
    const data = await res.json();
    if (!data.success) throw new Error("Pipedrive API returned success: false");
    batch.push(...(data.data || []));
    hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
    nextStart = data.additional_data?.pagination?.next_start || nextStart + 500;
  }

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);
  let imported = 0;

  for (const org of batch) {
    const name = org.name?.trim();
    if (!name) continue;
    const companyId = await ensureCompany(supabase, companyByName, userId, name, { email: org.cc_email || "" });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    if (org.won_deals_count > 0) {
      try {
        const dealsParams = new URLSearchParams({ api_token: apiKey, status: "won", limit: "50" });
        const dealsRes = await fetchWithTimeout(`${baseUrl}/organizations/${org.id}/deals?${dealsParams}`);
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          const totalValue = (dealsData.data || []).reduce((sum: number, d: any) => sum + (Number(d.value) || 0), 0);
          if (totalValue > 0) sd.mrr = Math.round(totalValue / 12);
        }
      } catch {}
    }
    if (org.last_activity_date) sd.lastLogin = org.last_activity_date;
    if (org.next_activity_date) sd.contractEnd = org.next_activity_date;
    if (org.activities_count != null && org.done_activities_count != null) {
      const total = Number(org.activities_count);
      const done = Number(org.done_activities_count);
      sd.usageScore = total > 0 ? Math.round((done / total) * 100) : 0;
    }
    if (org.open_deals_count != null) sd.openDeals = Number(org.open_deals_count);
    if (org.won_deals_count != null) sd.wonDeals = Number(org.won_deals_count);
    if (org.lost_deals_count != null) sd.lostDeals = Number(org.lost_deals_count);
    if (org.people_count != null) sd.contacts = Number(org.people_count);

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "pipedrive", sd);
    if (sErr) { console.error(`[Pipedrive] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Pipedrive] Batch done: imported ${imported}, hasMore=${hasMore}`);
  return { records: imported, nextCursor: hasMore ? JSON.stringify({ offset: nextStart }) : undefined };
};

// ======================= STRIPE =======================
const stripeHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/x-www-form-urlencoded" };

  const batch: Array<Record<string, any>> = [];
  let startingAfter: string | undefined = cursor.apiCursor;
  let hasMore = true;
  let lastId: string | undefined;

  while (hasMore && batch.length < BATCH_SIZE) {
    const params = new URLSearchParams({ limit: "100", "expand[]": "data.subscriptions" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const res = await fetchWithTimeout(`https://api.stripe.com/v1/customers?${params}`, { headers });
    if (!res.ok) { const t = await res.text(); throw new Error(`Stripe API error ${res.status}: ${t}`); }
    const data = await res.json();
    batch.push(...(data.data || []));
    hasMore = data.has_more || false;
    if (data.data?.length) { lastId = data.data[data.data.length - 1].id; startingAfter = lastId; }
    else hasMore = false;
  }

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);

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

  // Fetch failed invoices (only on first batch to avoid repeated calls)
  const failedInvoices = new Map<string, number>();
  if (!cursor.apiCursor) {
    try {
      const invRes = await fetchWithTimeout(`https://api.stripe.com/v1/invoices?status=open&limit=100`, { headers });
      if (invRes.ok) {
        const invData = await invRes.json();
        for (const inv of invData.data || []) {
          if (inv.customer && inv.attempt_count > 0) failedInvoices.set(inv.customer, (failedInvoices.get(inv.customer) || 0) + 1);
        }
      }
    } catch {}
  }

  let imported = 0;

  for (const cust of batch) {
    const name = (cust.name || cust.email || "").trim();
    if (!name) continue;
    const companyId = await ensureCompany(supabase, companyByName, userId, name, {
      industry: cust.metadata?.industry || "", email: cust.email || "",
    });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    const activeSubs = (cust.subscriptions?.data || []).filter((s: any) => s.status === "active" || s.status === "trialing");
    let totalMrr = 0;
    let latestEnd: string | null = null;
    for (const sub of activeSubs) {
      totalMrr += calcMrr(sub);
      if (sub.current_period_end) {
        const end = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];
        if (!latestEnd || end > latestEnd) latestEnd = end;
      }
    }
    sd.mrr = totalMrr;
    if (latestEnd) sd.contractEnd = latestEnd;
    sd.activeSubscriptions = activeSubs.length;
    const canceledSubs = (cust.subscriptions?.data || []).filter((s: any) => s.status === "canceled").length;
    if (canceledSubs > 0) sd.canceledSubscriptions = canceledSubs;
    const failures = failedInvoices.get(cust.id) || 0;
    if (failures > 0) sd.paymentFailures = failures;
    if (cust.metadata?.plan) sd.plan = cust.metadata.plan;
    else if (activeSubs.length > 0 && activeSubs[0].items?.data?.[0]?.price?.nickname) sd.plan = activeSubs[0].items.data[0].price.nickname;
    for (const [key, value] of Object.entries(cust.metadata || {})) {
      if (value && !sd[key] && key !== "industry") sd[key] = value;
    }

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "stripe", sd);
    if (sErr) { console.error(`[Stripe] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Stripe] Batch done: imported ${imported}, hasMore=${hasMore}`);
  return { records: imported, nextCursor: hasMore && lastId ? JSON.stringify({ apiCursor: lastId }) : undefined };
};

// ======================= SEGMENT =======================
const segmentHandler: Handler = async (apiKey, userId, supabase, cursor) => {
  const sepIdx = apiKey.indexOf("|");
  if (sepIdx === -1) throw new Error("Invalid Segment credentials. Expected: spaceId|accessToken");
  const spaceId = apiKey.substring(0, sepIdx);
  const accessToken = apiKey.substring(sepIdx + 1);
  const baseUrl = `https://profiles.segment.com/v1/spaces/${spaceId}/collections/accounts/profiles`;
  const headers = { Authorization: "Basic " + btoa(`${accessToken}:`), "Content-Type": "application/json" };

  const batch: Array<Record<string, any>> = [];
  let apiCursor: string | undefined = cursor.apiCursor;
  let hasMore = true;
  let nextCursorValue: string | undefined;

  while (hasMore && batch.length < BATCH_SIZE) {
    const params = new URLSearchParams({ limit: "100", include: "traits" });
    if (apiCursor) params.set("cursor", apiCursor);
    const res = await fetchWithTimeout(`${baseUrl}?${params}`, { headers });
    if (res.status === 404) throw new Error("Segment Profile API 404. Ensure Unify is enabled and Space ID is correct.");
    if (res.status === 401 || res.status === 403) throw new Error("Segment auth failed. Check your Profile API Access Token.");
    if (!res.ok) { const t = await res.text(); throw new Error(`Segment API error ${res.status}: ${t}`); }
    const data = await res.json();
    batch.push(...(data.data || []));
    hasMore = data.cursor?.has_more || false;
    nextCursorValue = data.cursor?.next;
    apiCursor = nextCursorValue;
  }

  if (batch.length === 0) return { records: 0 };

  const companyByName = await loadCompanyMap(supabase, userId);

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

  for (const profile of batch) {
    const traits = profile.traits || {};
    const name = (traits.name || traits.company_name || "").trim();
    if (!name) continue;
    const companyId = await ensureCompany(supabase, companyByName, userId, name, { industry: traits.industry || "", email: traits.email || "" });
    if (!companyId) continue;

    const sd: Record<string, any> = {};
    for (const [key, value] of Object.entries(traits)) {
      if (COMPANY_KEYS.has(key)) continue;
      if (value == null || value === "") continue;
      const normalized = key.toLowerCase().replace(/[\s-]/g, "_");
      const mapped = TRAIT_MAP[normalized];
      if (mapped) {
        if (mapped === "lastLogin" || mapped === "contractEnd") sd[mapped] = String(value).split("T")[0];
        else sd[mapped] = Number(value) || 0;
      } else {
        const numVal = Number(value);
        sd[normalized] = isNaN(numVal) ? value : numVal;
      }
    }

    const sErr = await upsertCompanySnapshot(supabase, companyId, userId, "segment", sd);
    if (sErr) { console.error(`[Segment] Snapshot failed "${name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Segment] Batch done: imported ${imported}, hasMore=${hasMore}`);
  return { records: imported, nextCursor: hasMore && nextCursorValue ? JSON.stringify({ apiCursor: nextCursorValue }) : undefined };
};

// ======================= SLACK =======================
// Slack is an enrichment connector — usually small dataset, no chunking needed
const slackHandler: Handler = async (apiKey, userId, supabase, _cursor) => {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const allChannels: Array<Record<string, any>> = [];
  let slackCursor: string | undefined;
  do {
    const params = new URLSearchParams({ types: "public_channel,private_channel", limit: "200", exclude_archived: "true" });
    if (slackCursor) params.set("cursor", slackCursor);
    const res = await fetchWithTimeout(`https://slack.com/api/conversations.list?${params}`, { headers });
    if (!res.ok) throw new Error(`Slack HTTP error ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error || "unknown"}`);
    allChannels.push(...(data.channels || []));
    slackCursor = data.response_metadata?.next_cursor || undefined;
    if (slackCursor === "") slackCursor = undefined;
  } while (slackCursor);

  const { data: existingCompanies } = await supabase.from("companies").select("id, name").eq("user_id", userId);
  if (!existingCompanies?.length) { console.log(`[Slack] No existing companies to match`); return { records: 0 }; }

  const companyByNormalized = new Map<string, { id: string; name: string }>();
  for (const c of existingCompanies) companyByNormalized.set(c.name.toLowerCase().replace(/[^a-z0-9]/g, ""), c);

  const pairs: Array<{ channel: Record<string, any>; company: { id: string; name: string } }> = [];
  for (const ch of allChannels) {
    const chNorm = ch.name.toLowerCase().replace(/^(customer-|shared-|client-|ext-)/, "").replace(/[^a-z0-9]/g, "");
    for (const [compNorm, company] of companyByNormalized) {
      if (chNorm.includes(compNorm) || compNorm.includes(chNorm)) { pairs.push({ channel: ch, company }); break; }
    }
  }

  if (pairs.length === 0) { console.log(`[Slack] No channels matched`); return { records: 0 }; }

  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  let imported = 0;

  for (const { channel, company } of pairs) {
    let messageCount = 0;
    const uniqueUsers = new Set<string>();
    let latestTs: number | null = null;

    try {
      const hParams = new URLSearchParams({ channel: channel.id, limit: "200", oldest: String(sevenDaysAgo) });
      const hRes = await fetchWithTimeout(`https://slack.com/api/conversations.history?${hParams}`, { headers });
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

    const sd: Record<string, any> = {
      slackMessages7d: messageCount,
      slackActiveUsers7d: uniqueUsers.size,
      slackChannelMembers: channel.num_members || 0,
      slackChannel: `#${channel.name}`,
    };
    if (latestTs) sd.lastLogin = new Date(latestTs * 1000).toISOString().split("T")[0];
    if (messageCount === 0) sd.usageScore = 0;
    else if (messageCount <= 5) sd.usageScore = 25;
    else if (messageCount <= 15) sd.usageScore = 50;
    else if (messageCount <= 40) sd.usageScore = 75;
    else sd.usageScore = 95;

    const sErr = await upsertCompanySnapshot(supabase, company.id, userId, "slack", sd);
    if (sErr) { console.error(`[Slack] Snapshot failed "${company.name}":`, sErr.message); continue; }
    imported++;
  }

  console.log(`[Slack] Enriched ${imported} companies`);
  return { records: imported };
};

// ======================= HANDLER MAP =======================
const importHandlers: Record<string, Handler> = {
  hubspot: hubspotHandler,
  intercom: intercomHandler,
  salesforce: salesforceHandler,
  zendesk: zendeskHandler,
  pipedrive: pipedriveHandler,
  stripe: stripeHandler,
  segment: segmentHandler,
  slack: slackHandler,
};

// ======================= MAIN =======================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse body
    let filterConnectorId: string | null = null;
    let filterUserId: string | null = null;
    let resumeLogId: string | null = null;
    let resumeCursor: string | null = null;
    try {
      const body = await req.json();
      filterConnectorId = body?.connector_id || null;
      filterUserId = body?.user_id || null;
      resumeLogId = body?.resume_log_id || null;
      resumeCursor = body?.resume_cursor || null;
    } catch {}

    // If resuming a specific import log
    if (resumeLogId && resumeCursor && filterConnectorId && filterUserId) {
      console.log(`[daily-import] Resuming ${filterConnectorId} for user ${filterUserId} (log=${resumeLogId})`);

      const { data: connector } = await supabase
        .from("user_connectors")
        .select("*")
        .eq("user_id", filterUserId)
        .eq("connector_id", filterConnectorId)
        .eq("is_active", true)
        .single();

      if (!connector) throw new Error(`No active connector found for resume`);

      const handler = importHandlers[filterConnectorId];
      if (!handler) throw new Error(`No handler for ${filterConnectorId}`);

      const cursor = parseCursor(resumeCursor);
      const result = await handler(connector.api_key, filterUserId, supabase, cursor);

      // Update the existing log with cumulative records
      const { data: existingLog } = await supabase.from("import_logs").select("records_imported").eq("id", resumeLogId).single();
      const totalRecords = (existingLog?.records_imported || 0) + result.records;

      if (result.nextCursor) {
        // More to process — update log and self-invoke
        await supabase.from("import_logs").update({
          records_imported: totalRecords,
          import_cursor: result.nextCursor,
        }).eq("id", resumeLogId);

        console.log(`[daily-import] Scheduling next chunk (total so far: ${totalRecords})`);
        // Self-invoke for next chunk
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
        fetch(`${supabaseUrl}/functions/v1/daily-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            connector_id: filterConnectorId,
            user_id: filterUserId,
            resume_log_id: resumeLogId,
            resume_cursor: result.nextCursor,
          }),
        }).catch((err) => console.error("[daily-import] Self-invoke failed:", err));

        return new Response(JSON.stringify({ success: true, status: "chunked", totalSoFar: totalRecords, hasMore: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Done
        await supabase.from("import_logs").update({
          status: "success",
          records_imported: totalRecords,
          import_cursor: null,
          completed_at: new Date().toISOString(),
        }).eq("id", resumeLogId);

        await supabase.from("user_connectors").update({ last_import_at: new Date().toISOString() }).eq("id", connector.id);

        console.log(`[daily-import] Completed ${filterConnectorId}: ${totalRecords} total records`);
        return new Response(JSON.stringify({ success: true, status: "complete", totalRecords }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Normal flow: process all active connectors (first chunk each)
    let query = supabase.from("user_connectors").select("*").eq("is_active", true);
    if (filterConnectorId) query = query.eq("connector_id", filterConnectorId);
    if (filterUserId) query = query.eq("user_id", filterUserId);
    const { data: activeConnectors, error: fetchError } = await query;

    if (fetchError) throw new Error(`Failed to fetch connectors: ${fetchError.message}`);
    console.log(`[daily-import] Found ${activeConnectors?.length || 0} active connectors`);

    const results = [];

    for (const connector of activeConnectors || []) {
      console.log(`[daily-import] Processing ${connector.connector_id} for user ${connector.user_id}`);
      const handler = importHandlers[connector.connector_id];
      if (!handler) { console.log(`[daily-import] No handler for: ${connector.connector_id}`); continue; }

      const { data: log } = await supabase.from("import_logs").insert({
        user_id: connector.user_id,
        connector_id: connector.connector_id,
        status: "running",
      }).select().single();

      try {
        const result = await handler(connector.api_key, connector.user_id, supabase, {});

        if (result.nextCursor && log) {
          // More chunks needed — update log and self-invoke
          await supabase.from("import_logs").update({
            records_imported: result.records,
            import_cursor: result.nextCursor,
          }).eq("id", log.id);

          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
          fetch(`${supabaseUrl}/functions/v1/daily-import`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              connector_id: connector.connector_id,
              user_id: connector.user_id,
              resume_log_id: log.id,
              resume_cursor: result.nextCursor,
            }),
          }).catch((err) => console.error("[daily-import] Self-invoke failed:", err));

          results.push({ connector: connector.connector_id, user: connector.user_id, status: "chunked", records: result.records, hasMore: true });
        } else {
          // Complete in one batch
          await supabase.from("import_logs").update({
            status: "success",
            records_imported: result.records,
            completed_at: new Date().toISOString(),
          }).eq("id", log?.id);

          await supabase.from("user_connectors").update({ last_import_at: new Date().toISOString() }).eq("id", connector.id);

          results.push({ connector: connector.connector_id, user: connector.user_id, status: "success", records: result.records });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await supabase.from("import_logs").update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        }).eq("id", log?.id);

        results.push({ connector: connector.connector_id, user: connector.user_id, status: "failed", error: errorMessage });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-import] Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
