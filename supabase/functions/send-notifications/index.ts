import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Health score calculation (server-side duplicate) ──
const scoreDateRecency = (dateStr: string): number => {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const days = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 3) return 100;
  if (days >= 30) return 0;
  return Math.round(100 * (1 - (days - 3) / 27));
};

const scoreNumber = (value: number, min: number, max: number, invert = false): number => {
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  const normalised = (clamped - min) / (max - min);
  return Math.round((invert ? 1 - normalised : normalised) * 100);
};

const SCORE_FIELDS = [
  { key: "mrr", weight: 20, type: "number", min: 0, max: 30000, invert: false },
  { key: "nps", weight: 20, type: "nps", min: -100, max: 100, invert: false },
  { key: "lastLogin", weight: 10, type: "date", min: 0, max: 100, invert: false },
  { key: "supportTickets", weight: 15, type: "number", min: 0, max: 20, invert: true },
  { key: "contractEnd", weight: 10, type: "date", min: 0, max: 100, invert: false },
  { key: "usageScore", weight: 25, type: "number", min: 0, max: 100, invert: false },
];

const calculateScore = (data: Record<string, any>): number => {
  const totalWeight = SCORE_FIELDS.reduce((s, f) => s + f.weight, 0);
  if (totalWeight === 0) return 0;
  let total = 0;
  for (const f of SCORE_FIELDS) {
    const raw = data[f.key];
    let fieldScore = 0;
    if (f.type === "date") fieldScore = scoreDateRecency(String(raw ?? ""));
    else if (f.type === "nps") fieldScore = scoreNumber(Number(raw) || 0, -100, 100);
    else fieldScore = scoreNumber(Number(raw) || 0, f.min ?? 0, f.max ?? 100, f.invert);
    total += fieldScore * (f.weight / totalWeight);
  }
  return Math.round(total);
};

const getStatus = (score: number): string => {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Monitor";
  if (score >= 40) return "At Risk";
  return "Critical";
};

const getStatusEmoji = (status: string): string => {
  switch (status) {
    case "Healthy": return "🟢";
    case "Monitor": return "🔵";
    case "At Risk": return "🟡";
    case "Critical": return "🔴";
    default: return "⚪";
  }
};

// ── Frequency check ──
const isDue = (frequency: string, lastNotified: string | null): boolean => {
  if (!lastNotified) return true;
  const last = new Date(lastNotified).getTime();
  const now = Date.now();
  const hoursSince = (now - last) / (1000 * 60 * 60);

  switch (frequency) {
    case "daily": return hoursSince >= 20;
    case "weekly": return hoursSince >= 144;
    case "biweekly": return hoursSince >= 312;
    case "monthly": return hoursSince >= 672;
    case "quarterly": return hoursSince >= 2016;
    default: return hoursSince >= 144;
  }
};

// ── Email HTML builder ──
const buildEmailHtml = (
  username: string,
  alerts: Array<{ name: string; score: number; status: string; previousScore: number | null; mrr: number }>,
  topCompanies: Array<{ name: string; score: number; status: string; mrr: number }>,
  threshold: number,
  isTest: boolean
): string => {
  const alertRows = alerts.map((a) => {
    const change = a.previousScore != null ? ` (was ${a.previousScore})` : "";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${a.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${a.score < 40 ? '#dc2626' : '#f59e0b'}">${a.score}${change}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${a.status}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">$${a.mrr.toLocaleString()}</td>
    </tr>`;
  }).join("");

  const topRows = topCompanies.map((c, i) => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee">${i + 1}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee">${c.name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${c.score >= 80 ? '#16a34a' : c.score >= 60 ? '#3b82f6' : c.score >= 40 ? '#f59e0b' : '#dc2626'}">${c.score}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee">${c.status}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee">$${c.mrr.toLocaleString()}</td>
  </tr>`).join("");

  const testBanner = isTest
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:24px">
        <p style="margin:0;color:#1d4ed8;font-size:14px">🧪 This is a test notification. Here's a preview of what your scheduled alerts will look like.</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#111827;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="margin:0;font-size:22px">Customer Health Report</h1>
    <p style="margin:8px 0 0;opacity:0.8;font-size:14px">Hi ${username || "there"}, here's your latest update.</p>
  </div>
  <div style="background:white;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
    ${testBanner}
    ${alerts.length > 0 ? `
    <div style="margin-bottom:24px">
      <h2 style="font-size:16px;margin:0 0 12px;color:#dc2626">⚠️ ${alerts.length} Account${alerts.length !== 1 ? "s" : ""} Below Threshold (${threshold})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Company</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Score</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Status</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">MRR</th>
        </tr></thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:24px">
      <p style="margin:0;color:#16a34a;font-size:14px">✅ All accounts are above your threshold of ${threshold}. No alerts at this time.</p>
    </div>`}
    ${topCompanies.length > 0 ? `
    <div>
      <h2 style="font-size:16px;margin:0 0 12px">📊 Top ${topCompanies.length} Companies by MRR</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">#</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Company</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Score</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Status</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">MRR</th>
        </tr></thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>` : ""}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Sent by Rescuro · Manage notification settings</p>
</div>
</body>
</html>`;
};

// ── Slack message builder ──
const buildSlackPayload = (
  alerts: Array<{ name: string; score: number; status: string; previousScore: number | null; mrr: number }>,
  topCompanies: Array<{ name: string; score: number; status: string; mrr: number }>,
  threshold: number,
  isTest: boolean
): object => {
  const blocks: any[] = [];

  if (isTest) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "🧪 *Test Notification* — Here's a preview of your scheduled alerts." } });
    blocks.push({ type: "divider" });
  }

  if (alerts.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `⚠️ *${alerts.length} Account${alerts.length !== 1 ? "s" : ""} Below Threshold (${threshold})*` } });
    const alertLines = alerts.map((a) => {
      const emoji = getStatusEmoji(a.status);
      const change = a.previousScore != null ? ` (was ${a.previousScore})` : "";
      return `${emoji} *${a.name}* — Score: ${a.score}${change} · MRR: $${a.mrr.toLocaleString()}`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: alertLines.join("\n") } });
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `✅ All accounts are above your threshold of ${threshold}. No alerts.` } });
  }

  blocks.push({ type: "divider" });

  if (topCompanies.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `📊 *Top ${topCompanies.length} Companies by MRR*` } });
    const topLines = topCompanies.map((c, i) => {
      const emoji = getStatusEmoji(c.status);
      return `${i + 1}. ${emoji} *${c.name}* — Score: ${c.score} · $${c.mrr.toLocaleString()}/mo`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: topLines.join("\n") } });
  }

  return { blocks };
};

// ── Email sender (Resend) ──
const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "Rescuro <alerts@rescuro.com>";

  if (!apiKey) {
    console.error("[Notifications] RESEND_API_KEY not set");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Notifications] Resend error ${res.status}: ${err}`);
    return false;
  }
  await res.text();
  return true;
};

// ── Slack sender ──
const sendSlack = async (webhookUrl: string, payload: object): Promise<boolean> => {
  if (!webhookUrl) return false;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[Notifications] Slack error ${res.status}: ${err}`);
    return false;
  }
  await res.text();
  return true;
};

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let isTest = false;
    let testUserId: string | null = null;
    try {
      const body = await req.json();
      isTest = body?.test === true;
      testUserId = body?.user_id || null;
    } catch {
      // No body — scheduled run
    }

    // 1. Fetch profiles
    let profileQuery = supabase
      .from("profiles")
      .select("user_id, username, plan, notification_frequency, email_notifications, slack_notifications, alert_threshold, slack_webhook_url, last_notified_at");

    if (isTest && testUserId) {
      profileQuery = profileQuery.eq("user_id", testUserId);
    }

    const { data: profiles, error: pErr } = await profileQuery;
    if (pErr) throw new Error(`Failed to fetch profiles: ${pErr.message}`);

    // Fetch user emails
    const { data: authData } = await supabase.auth.admin.listUsers();
    const emailMap = new Map((authData?.users || []).map((u: any) => [u.id, u.email]));

    const results: Array<{ userId: string; email: boolean; slack: boolean }> = [];

    for (const profile of profiles || []) {
      if (!isTest && !profile.email_notifications && !profile.slack_notifications) continue;
      if (!isTest && !isDue(profile.notification_frequency, profile.last_notified_at)) continue;

      const userId = profile.user_id;
      const userEmail = emailMap.get(userId);
      const threshold = profile.alert_threshold ?? 60;

      // 2. Fetch companies + snapshots
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, industry")
        .eq("user_id", userId);

      if (!companies?.length) continue;

      const { data: snapshots } = await supabase
        .from("company_snapshots")
        .select("company_id, snapshot_date, data")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: false });

      const latestByCompany = new Map<string, any>();
      const previousByCompany = new Map<string, any>();
      for (const s of snapshots || []) {
        if (!latestByCompany.has(s.company_id)) {
          latestByCompany.set(s.company_id, s);
        } else if (!previousByCompany.has(s.company_id)) {
          previousByCompany.set(s.company_id, s);
        }
      }

      // 3. Compute scores
      const scored = companies.map((c: any) => {
        const latestSnap = latestByCompany.get(c.id);
        const previousSnap = previousByCompany.get(c.id);
        const data = (latestSnap?.data as Record<string, any>) || {};
        const prevData = (previousSnap?.data as Record<string, any>) || {};

        const score = calculateScore({ ...data, industry: c.industry });
        const previousScore = previousSnap ? calculateScore({ ...prevData, industry: c.industry }) : null;
        const mrr = Number(data.mrr) || 0;
        const status = getStatus(score);

        return { name: c.name, score, previousScore, mrr, status };
      });

      const alerts = scored
        .filter((c: any) => c.score < threshold)
        .sort((a: any, b: any) => a.score - b.score);

      const topCompanies = [...scored]
        .sort((a: any, b: any) => b.mrr - a.mrr)
        .slice(0, 15);

      // 4. Send notifications
      let emailSent = false;
      let slackSent = false;

      if ((profile.email_notifications || isTest) && userEmail) {
        const subject = alerts.length > 0
          ? `⚠️ ${alerts.length} account${alerts.length !== 1 ? "s" : ""} need attention`
          : "✅ Customer Health Report — All clear";

        const html = buildEmailHtml(profile.username || "", alerts, topCompanies, threshold, isTest);
        emailSent = await sendEmail(userEmail, subject, html);

        await supabase.from("notification_logs").insert({
          user_id: userId,
          channel: "email",
          notification_type: isTest ? "test" : "scheduled",
          companies_included: topCompanies.length,
          alerts_count: alerts.length,
          status: emailSent ? "sent" : "failed",
          error_message: emailSent ? null : "Email send failed",
        });
      }

      if ((profile.slack_notifications || isTest) && profile.slack_webhook_url) {
        const slackPayload = buildSlackPayload(alerts, topCompanies, threshold, isTest);
        slackSent = await sendSlack(profile.slack_webhook_url, slackPayload);

        await supabase.from("notification_logs").insert({
          user_id: userId,
          channel: "slack",
          notification_type: isTest ? "test" : "scheduled",
          companies_included: topCompanies.length,
          alerts_count: alerts.length,
          status: slackSent ? "sent" : "failed",
          error_message: slackSent ? null : "Slack webhook failed",
        });
      }

      // 5. Update last_notified_at (skip for tests)
      if (!isTest && (emailSent || slackSent)) {
        await supabase
          .from("profiles")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("user_id", userId);
      }

      results.push({ userId, email: emailSent, slack: slackSent });
    }

    return new Response(JSON.stringify({ success: true, test: isTest, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Notifications] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
