import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------- Health score (mirrors src/lib/healthScore.ts) ----------
const GRACE_DAYS = 3;
const MAX_DAYS = 30;
const scoreDateRecency = (dateStr: string): number => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  const days = Math.max(0, (Date.now() - d.getTime()) / 86400000);
  if (days <= GRACE_DAYS) return 100;
  if (days >= MAX_DAYS) return 0;
  return Math.round(100 * (1 - (days - GRACE_DAYS) / (MAX_DAYS - GRACE_DAYS)));
};
const scoreNumber = (value: number, min: number, max: number, invert = false): number => {
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  const n = (clamped - min) / (max - min);
  return Math.round((invert ? 1 - n : n) * 100);
};

type ScoreField = { key: string; weight: number; type: string; min?: number; max?: number; invert?: boolean };

const DEFAULT_SCORE_FIELDS: ScoreField[] = [
  { key: "mrr", weight: 20, type: "number", min: 0, max: 30000 },
  { key: "nps", weight: 20, type: "nps" },
  { key: "lastLogin", weight: 10, type: "date" },
  { key: "supportTickets", weight: 15, type: "number", min: 0, max: 20, invert: true },
  { key: "contractEnd", weight: 10, type: "date" },
  { key: "usageScore", weight: 25, type: "number", min: 0, max: 100 },
];

// Map the profile's UI field config into scoring fields (mirrors src/lib/scoreFields.ts)
function toScoreFields(uiFields: any): ScoreField[] {
  if (!Array.isArray(uiFields) || uiFields.length === 0) return DEFAULT_SCORE_FIELDS;
  const byKey = new Map(DEFAULT_SCORE_FIELDS.map((f) => [f.key, f]));
  return uiFields
    .filter((f: any) => f?.enabled && Number(f.weight) > 0 && f.type !== "text")
    .map((f: any) => {
      const known = byKey.get(f.key);
      if (known) return { ...known, weight: Number(f.weight) };
      return {
        key: f.key,
        weight: Number(f.weight),
        type: f.type === "date" ? "date" : "number",
        min: f.min ?? 0,
        max: f.max ?? 100,
      } as ScoreField;
    });
}

function computeHealthScore(data: Record<string, unknown>, fields: ScoreField[]): number {
  const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
  if (!totalWeight) return 0;
  let total = 0;
  for (const f of fields) {
    const raw = data[f.key];
    let fs = 0;
    if (f.type === "date") fs = scoreDateRecency(String(raw ?? ""));
    else if (f.type === "nps") fs = scoreNumber(Number(raw) || 0, -100, 100);
    else fs = scoreNumber(Number(raw) || 0, f.min ?? 0, f.max ?? 100, f.invert);
    total += fs * (f.weight / totalWeight);
  }
  return Math.round(total);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_RECORDS = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface IngestRecord {
  company: string;
  email?: string;
  industry?: string;
  snapshot_date?: string;
  data: Record<string, unknown>;
}

function validate(body: any): { records: IngestRecord[] } | { error: string } {
  const rawList = Array.isArray(body?.records)
    ? body.records
    : Array.isArray(body)
      ? body
      : body && typeof body === "object"
        ? [body]
        : null;

  if (!rawList) return { error: "Body must be an object or an array of records." };
  if (rawList.length === 0) return { error: "No records provided." };
  if (rawList.length > MAX_RECORDS) return { error: `Too many records (max ${MAX_RECORDS} per request).` };

  const records: IngestRecord[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const r = rawList[i];
    if (!r || typeof r !== "object") return { error: `Record ${i}: must be an object.` };
    const company = typeof r.company === "string" ? r.company.trim() : "";
    if (!company || company.length > 255) return { error: `Record ${i}: "company" is required (1–255 chars).` };
    if (r.email != null && (typeof r.email !== "string" || r.email.length > 255))
      return { error: `Record ${i}: "email" must be a string.` };
    if (r.industry != null && (typeof r.industry !== "string" || r.industry.length > 120))
      return { error: `Record ${i}: "industry" must be a string.` };
    if (r.snapshot_date != null && (typeof r.snapshot_date !== "string" || !DATE_RE.test(r.snapshot_date)))
      return { error: `Record ${i}: "snapshot_date" must be YYYY-MM-DD.` };
    const data = r.data ?? r.metrics;
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { error: `Record ${i}: "data" must be an object of metric key/values.` };
    if (Object.keys(data).length > 60) return { error: `Record ${i}: too many metric fields (max 60).` };
    records.push({
      company,
      email: r.email ?? undefined,
      industry: r.industry ?? undefined,
      snapshot_date: r.snapshot_date ?? undefined,
      data: data as Record<string, unknown>,
    });
  }
  return { records };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);

  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey =
      req.headers.get("x-api-key") ||
      (authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "");

    if (!apiKey || !apiKey.startsWith("rsc_")) {
      return json({ error: "Missing or malformed API key. Send it in the 'x-api-key' header." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("id, user_id, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!keyRow || keyRow.revoked_at) return json({ error: "Invalid or revoked API key." }, 401);
    const userId = keyRow.user_id as string;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const parsed = validate(body);
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const { records } = parsed;

    // User's custom weights (if configured)
    const { data: profile } = await supabase
      .from("profiles")
      .select("score_fields")
      .eq("user_id", userId)
      .maybeSingle();
    const scoreFields = toScoreFields(profile?.score_fields);

    // Existing companies for this user
    const { data: existing } = await supabase
      .from("companies")
      .select("id, name")
      .eq("user_id", userId);
    const companyByName = new Map<string, string>(
      (existing || []).map((c: any) => [String(c.name).toLowerCase().trim(), c.id as string]),
    );

    let created = 0;
    let snapshots = 0;
    const errors: { company: string; error: string }[] = [];

    for (const rec of records) {
      const key = rec.company.toLowerCase().trim();
      let companyId = companyByName.get(key);

      if (!companyId) {
        const { data: nc, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: userId, name: rec.company, industry: rec.industry || "", email: rec.email || "" })
          .select("id")
          .single();
        if (cErr || !nc) {
          errors.push({ company: rec.company, error: cErr?.message || "Could not create company" });
          continue;
        }
        companyId = nc.id as string;
        companyByName.set(key, companyId);
        created++;
      } else if (rec.email || rec.industry) {
        await supabase
          .from("companies")
          .update({
            ...(rec.email ? { email: rec.email } : {}),
            ...(rec.industry ? { industry: rec.industry } : {}),
          })
          .eq("id", companyId)
          .eq("user_id", userId);
      }

      const health_score = computeHealthScore(rec.data, scoreFields);
      const snapshot_date = rec.snapshot_date || new Date().toISOString().slice(0, 10);

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .upsert(
          { company_id: companyId, user_id: userId, source: "api", snapshot_date, data: rec.data, health_score },
          { onConflict: "company_id,snapshot_date" },
        );

      if (sErr) errors.push({ company: rec.company, error: sErr.message });
      else snapshots++;
    }

    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);

    return json({
      ok: errors.length === 0,
      companies_created: created,
      snapshots_written: snapshots,
      errors,
    }, errors.length && snapshots === 0 ? 422 : 200);
  } catch (err) {
    console.error("ingest error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
