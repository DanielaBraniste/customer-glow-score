import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHealthScore } from "@/lib/healthScore";
import { DEFAULT_UI_FIELDS, UiFieldConfig, toScoreFields } from "@/lib/scoreFields";

export function useScoreFields() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["score-fields", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UiFieldConfig[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("score_fields")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const saved = (data?.score_fields as unknown) as UiFieldConfig[] | null;
      if (saved && Array.isArray(saved) && saved.length) return saved;
      return DEFAULT_UI_FIELDS;
    },
  });
}

interface SaveInput {
  fields: UiFieldConfig[];
  recalcHistory: boolean;
}

export function useSaveScoreFields() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fields, recalcHistory }: SaveInput) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Persist the new field configuration
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ score_fields: fields as any })
        .eq("user_id", user.id);
      if (pErr) throw pErr;

      let recalculated = 0;

      if (recalcHistory) {
        const scoreFields = toScoreFields(fields);

        // 2. Page through every snapshot for the user
        const PAGE = 500;
        let from = 0;
        // Build company → industry lookup once
        const { data: companies } = await supabase
          .from("companies")
          .select("id, industry")
          .eq("user_id", user.id);
        const industryById = new Map<string, string>(
          (companies || []).map((c) => [c.id, c.industry || ""]),
        );

        while (true) {
          const { data: batch, error: sErr } = await supabase
            .from("company_snapshots")
            .select("id, company_id, data, snapshot_date")
            .eq("user_id", user.id)
            .range(from, from + PAGE - 1);
          if (sErr) throw sErr;
          if (!batch || batch.length === 0) break;

          // Compute new scores and update one by one (parallelized in chunks)
          const updates = batch.map((s) => {
            const data = ((s.data as Record<string, any>) || {});
            const today = s.snapshot_date ? new Date(s.snapshot_date) : new Date();
            const total = calculateHealthScore(
              { ...data, industry: industryById.get(s.company_id) },
              scoreFields,
              today,
            ).total;
            return { id: s.id, health_score: total };
          });

          // Run updates in parallel chunks of 25
          const CHUNK = 25;
          for (let i = 0; i < updates.length; i += CHUNK) {
            const slice = updates.slice(i, i + CHUNK);
            await Promise.all(
              slice.map((u) =>
                supabase
                  .from("company_snapshots")
                  .update({ health_score: u.health_score })
                  .eq("id", u.id)
                  .eq("user_id", user.id),
              ),
            );
          }

          recalculated += batch.length;
          if (batch.length < PAGE) break;
          from += PAGE;
        }
      }

      return { recalculated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["score-fields"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["raw-snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["health-progression"] });
      queryClient.invalidateQueries({ queryKey: ["company-detail"] });
    },
  });
}
