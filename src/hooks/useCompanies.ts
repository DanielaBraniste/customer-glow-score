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
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user!.id);

      if (cErr) throw cErr;
      if (!companies?.length) return [];

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

// Fix 6 & 7: orphan cleanup + duplicate detection for single add
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

      // Fix 7: duplicate detection
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", input.name.trim())
        .maybeSingle();

      if (existing) {
        throw new Error(`A company named "${input.name.trim()}" already exists`);
      }

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

      // Fix 6: clean up orphan on snapshot failure
      if (sErr) {
        await supabase.from("companies").delete().eq("id", company.id);
        throw sErr;
      }

      return company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

// Fix 4, 5, 7: batch inserts, orphan cleanup, duplicate detection
const BATCH_SIZE = 100;

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

      // Fix 7: fetch existing names for dedup
      const { data: existingCompanies } = await supabase
        .from("companies")
        .select("name")
        .eq("user_id", user.id);

      const existingNames = new Set(
        (existingCompanies || []).map((c) => c.name.toLowerCase().trim())
      );

      const newRows = rows.filter((r) => !existingNames.has(r.name.toLowerCase().trim()));
      const skipped = rows.length - newRows.length;

      let totalAdded = 0;

      // Fix 4: batch inserts in chunks
      for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
        const chunk = newRows.slice(i, i + BATCH_SIZE);

        const companyInserts = chunk.map((row) => ({
          user_id: user.id,
          name: row.name,
          industry: row.industry,
          email: row.email || "",
        }));

        const { data: companies, error: cErr } = await supabase
          .from("companies")
          .insert(companyInserts)
          .select();

        if (cErr) {
          console.error("Batch company insert failed:", cErr);
          continue;
        }

        // Build name→company map for snapshot matching
        const nameMap = new Map<string, typeof companies[0]>();
        for (const c of companies) {
          nameMap.set(c.name.toLowerCase().trim(), c);
        }

        const snapshotInserts = chunk
          .map((row) => {
            const company = nameMap.get(row.name.toLowerCase().trim());
            if (!company) return null;
            return {
              company_id: company.id,
              user_id: user.id,
              source: row.source || "csv",
              data: row.snapshotData,
            };
          })
          .filter(Boolean) as Array<{
            company_id: string;
            user_id: string;
            source: string;
            data: Record<string, any>;
          }>;

        const { error: sErr } = await supabase
          .from("company_snapshots")
          .insert(snapshotInserts);

        // Fix 5: clean up orphans if snapshot batch fails
        if (sErr) {
          console.error("Batch snapshot insert failed:", sErr);
          const orphanIds = companies.map((c) => c.id);
          await supabase.from("companies").delete().in("id", orphanIds);
          continue;
        }

        totalAdded += companies.length;
      }

      return { added: totalAdded, total: rows.length, skipped };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      const parts = [`Imported ${result.added} of ${result.total} companies`];
      if (result.skipped > 0) parts.push(`(${result.skipped} duplicates skipped)`);
      toast.success(parts.join(" "));
    },
  });
}
