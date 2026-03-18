import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHealthScore, DEFAULT_SCORE_FIELDS } from "@/lib/healthScore";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";

export type TimeGranularity = "day" | "week" | "month";

export interface CompanyProgression {
  companyId: string;
  companyName: string;
  industry: string;
  customerSince: string;
  currentMrr: number;
  scores: Record<string, number>; // period key → health score
}

export function useHealthProgression(granularity: TimeGranularity) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["health-progression", user?.id, granularity],
    enabled: !!user,
    queryFn: async (): Promise<{ companies: CompanyProgression[]; periods: string[] }> => {
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user!.id);

      if (cErr) throw cErr;
      if (!companies?.length) return { companies: [], periods: [] };

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
        // Keep latest snapshot per period
        snapshotsByCompanyPeriod.get(s.company_id)!.set(period, s);
      }

      const periods = Array.from(allPeriods);

      const result: CompanyProgression[] = companies.map((c) => {
        const periodSnapshots = snapshotsByCompanyPeriod.get(c.id) || new Map();
        const scores: Record<string, number> = {};

        for (const period of periods) {
          const snap = periodSnapshots.get(period);
          if (snap) {
            const scoreData = { ...(snap.data as Record<string, any>), industry: c.industry };
            const result = calculateHealthScore(scoreData, DEFAULT_SCORE_FIELDS);
            scores[period] = result.total;
          }
        }

        // Get latest snapshot for current MRR
        const latestSnap = [...(periodSnapshots.values())].pop();
        const latestData = (latestSnap?.data || {}) as Record<string, any>;

        return {
          companyId: c.id,
          companyName: c.name,
          industry: c.industry || "",
          customerSince: format(parseISO(c.created_at), "MMM dd, yyyy"),
          currentMrr: Number(latestData.mrr) || 0,
          scores,
        };
      });

      return { companies: result, periods };
    },
  });
}
