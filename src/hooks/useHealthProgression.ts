import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHealthScore, DEFAULT_SCORE_FIELDS } from "@/lib/healthScore";
import { format, startOfWeek, startOfMonth, parseISO, subDays, subWeeks, subMonths } from "date-fns";

export type TimeGranularity = "day" | "week" | "month";

export interface CompanyProgression {
  companyId: string;
  companyName: string;
  industry: string;
  customerSince: string;
  currentMrr: number;
  scores: Record<string, number>; // period key → health score
  isDemo?: boolean;
}

// Demo data shown when no real snapshots exist
const DEMO_COMPANIES = [
  { name: "Acme Corp", industry: "SaaS", mrr: 12500, baseScore: 82 },
  { name: "Globex Inc", industry: "FinTech", mrr: 8200, baseScore: 65 },
  { name: "Initech", industry: "Healthcare", mrr: 4300, baseScore: 43 },
  { name: "Umbrella Ltd", industry: "E-commerce", mrr: 19000, baseScore: 91 },
  { name: "Stark Industries", industry: "Manufacturing", mrr: 15700, baseScore: 74 },
];

function generateDemoPeriods(granularity: TimeGranularity): string[] {
  const now = new Date();
  const periods: string[] = [];
  const count = granularity === "day" ? 7 : granularity === "week" ? 6 : 4;

  for (let i = count - 1; i >= 0; i--) {
    let date: Date;
    switch (granularity) {
      case "day":
        date = subDays(now, i);
        periods.push(format(date, "MMM dd"));
        break;
      case "week":
        date = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        periods.push(format(date, "MMM dd"));
        break;
      case "month":
        date = startOfMonth(subMonths(now, i));
        periods.push(format(date, "MMM yyyy"));
        break;
    }
  }
  return periods;
}

function generateDemoData(granularity: TimeGranularity): { companies: CompanyProgression[]; periods: string[] } {
  const periods = generateDemoPeriods(granularity);

  const companies: CompanyProgression[] = DEMO_COMPANIES.map((demo, idx) => {
    const scores: Record<string, number> = {};
    let currentScore = demo.baseScore;

    for (const period of periods) {
      // Add slight random-ish variation based on index + period for determinism
      const variation = Math.round(Math.sin(idx * 3 + periods.indexOf(period) * 1.7) * 5);
      currentScore = Math.max(10, Math.min(100, demo.baseScore + variation));
      scores[period] = currentScore;
    }

    return {
      companyId: `demo-${idx}`,
      companyName: demo.name,
      industry: demo.industry,
      customerSince: format(subMonths(new Date(), 3 + idx * 2), "MMM dd, yyyy"),
      currentMrr: demo.mrr,
      scores,
      isDemo: true,
    };
  });

  return { companies, periods };
}

export function useHealthProgression(granularity: TimeGranularity) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["health-progression", user?.id, granularity],
    enabled: !!user,
    queryFn: async (): Promise<{ companies: CompanyProgression[]; periods: string[]; isDemo: boolean }> => {
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user!.id);

      if (cErr) throw cErr;

      // No companies at all → show demo data
      if (!companies?.length) {
        return { ...generateDemoData(granularity), isDemo: true };
      }

      const { data: snapshots, error: sErr } = await supabase
        .from("company_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: true });

      if (sErr) throw sErr;

      const allPeriods = new Set<string>();

      const getPeriodKey = (dateStr: string): string => {
        const date = parseISO(dateStr);
        switch (granularity) {
          case "day":
            return format(date, "MMM dd");
          case "week":
            return format(startOfWeek(date, { weekStartsOn: 1 }), "MMM dd");
          case "month":
            return format(startOfMonth(date), "MMM yyyy");
        }
      };

      // Group snapshots by company and period
      const snapshotsByCompanyPeriod = new Map<string, Map<string, any>>();
      for (const s of snapshots || []) {
        const period = getPeriodKey(s.snapshot_date);
        allPeriods.add(period);

        if (!snapshotsByCompanyPeriod.has(s.company_id)) {
          snapshotsByCompanyPeriod.set(s.company_id, new Map());
        }
        snapshotsByCompanyPeriod.get(s.company_id)!.set(period, s);
      }

      let periods = Array.from(allPeriods);

      // If only one period exists (single snapshot per company), replicate current score as the only column
      // This ensures the table shows something meaningful even before multi-day data accumulates
      if (periods.length <= 1) {
        const today = new Date();
        const todayKey = getPeriodKey(format(today, "yyyy-MM-dd"));
        if (periods.length === 0) {
          periods = [todayKey];
        }
      }

      const result: CompanyProgression[] = companies.map((c) => {
        const periodSnapshots = snapshotsByCompanyPeriod.get(c.id) || new Map();
        const scores: Record<string, number> = {};

        // Get latest snapshot data for this company
        const allSnapsForCompany = [...(periodSnapshots.values())];
        const latestSnap = allSnapsForCompany.length > 0 ? allSnapsForCompany[allSnapsForCompany.length - 1] : null;
        const latestData = (latestSnap?.data || {}) as Record<string, any>;

        for (const period of periods) {
          const snap = periodSnapshots.get(period);
          if (snap) {
            const scoreData = { ...(snap.data as Record<string, any>), industry: c.industry };
            const scoreResult = calculateHealthScore(scoreData, DEFAULT_SCORE_FIELDS);
            scores[period] = scoreResult.total;
          } else if (latestSnap) {
            // Fill missing periods with latest known score so the table isn't empty
            const scoreData = { ...latestData, industry: c.industry };
            const scoreResult = calculateHealthScore(scoreData, DEFAULT_SCORE_FIELDS);
            scores[period] = scoreResult.total;
          }
        }

        return {
          companyId: c.id,
          companyName: c.name,
          industry: c.industry || "",
          customerSince: format(parseISO(c.created_at), "MMM dd, yyyy"),
          currentMrr: Number(latestData.mrr) || 0,
          scores,
        };
      });

      return { companies: result, periods, isDemo: false };
    },
  });
}
