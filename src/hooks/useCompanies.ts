import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Company {
  id: string;
  name: string;
  industry: string;
  email: string;
}

export interface CompanyWithSnapshot extends Company {
  snapshotData: Record<string, any>;
  snapshotDate: string | null;
  source: string;
}

export function useCompanies() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["companies", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CompanyWithSnapshot[]> => {
      // Fetch companies
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user!.id);

      if (cErr) throw cErr;
      if (!companies?.length) return [];

      // Fetch latest snapshot per company
      // We get all snapshots and pick latest per company client-side
      const { data: snapshots, error: sErr } = await supabase
        .from("company_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false });

      if (sErr) throw sErr;

      const latestByCompany = new Map<string, any>();
      for (const s of snapshots || []) {
        if (!latestByCompany.has(s.company_id)) {
          latestByCompany.set(s.company_id, s);
        }
      }

      return companies.map((c) => {
        const snap = latestByCompany.get(c.id);
        return {
          id: c.id,
          name: c.name,
          industry: c.industry || "",
          email: c.email || "",
          snapshotData: snap?.data || {},
          snapshotDate: snap?.snapshot_date || null,
          source: snap?.source || "manual",
        };
      });
    },
  });
}

export function useAddCompany() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      industry: string;
      email?: string;
      snapshotData: Record<string, any>;
      source?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: company, error: cErr } = await supabase
        .from("companies")
        .insert({ user_id: user.id, name: input.name, industry: input.industry, email: input.email || "" })
        .select()
        .single();

      if (cErr) throw cErr;

      const { error: sErr } = await supabase
        .from("company_snapshots")
        .insert({
          company_id: company.id,
          user_id: user.id,
          source: input.source || "manual",
          data: input.snapshotData,
        });

      if (sErr) throw sErr;
      return company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useBulkAddCompanies() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Array<{
      name: string;
      industry: string;
      email?: string;
      snapshotData: Record<string, any>;
      source?: string;
    }>) => {
      if (!user) throw new Error("Not authenticated");

      let added = 0;
      for (const row of rows) {
        const { data: company, error: cErr } = await supabase
          .from("companies")
          .insert({ user_id: user.id, name: row.name, industry: row.industry, email: row.email || "" })
          .select()
          .single();

        if (cErr) {
          console.error("Failed to add company:", row.name, cErr);
          continue;
        }

        const { error: sErr } = await supabase
          .from("company_snapshots")
          .insert({
            company_id: company.id,
            user_id: user.id,
            source: row.source || "csv",
            data: row.snapshotData,
          });

        if (sErr) console.error("Failed to add snapshot:", row.name, sErr);
        else added++;
      }
      return { added, total: rows.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(`Imported ${result.added} of ${result.total} companies`);
    },
  });
}
