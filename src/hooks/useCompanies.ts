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

// --- Delete company ---

export function useDeleteCompany() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Delete snapshots first (cascade should handle, but be explicit)
      await supabase
        .from("company_snapshots")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", user.id);

      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyId)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["duplicate-companies"] });
      queryClient.invalidateQueries({ queryKey: ["raw-snapshots"] });
      toast.success("Company deleted");
    },
  });
}

// --- Edit company ---

export function useEditCompany() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name: string; industry: string; email: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("companies")
        .update({ name: input.name, industry: input.industry, email: input.email })
        .eq("id", input.id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Company updated");
    },
  });
}

// --- Deduplication ---

export interface DuplicateGroup {
  name: string;
  primary: Company;
  duplicates: Company[];
  totalSnapshots: number;
  conflictingDates: number;
}

export function useDuplicateCompanies() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["duplicate-companies", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DuplicateGroup[]> => {
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (cErr) throw cErr;
      if (!companies?.length) return [];

      const groups = new Map<string, typeof companies>();
      for (const c of companies) {
        const key = c.name.toLowerCase().trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(c);
      }

      const duplicateGroups = [...groups.entries()].filter(([, members]) => members.length > 1);
      if (duplicateGroups.length === 0) return [];

      const allCompanyIds = duplicateGroups.flatMap(([, members]) => members.map((m) => m.id));
      const { data: snapshots } = await supabase
        .from("company_snapshots")
        .select("id, company_id, snapshot_date")
        .in("company_id", allCompanyIds);

      const snapshotsByCompany = new Map<string, Array<{ id: string; snapshot_date: string }>>();
      for (const s of snapshots || []) {
        if (!snapshotsByCompany.has(s.company_id)) snapshotsByCompany.set(s.company_id, []);
        snapshotsByCompany.get(s.company_id)!.push(s);
      }

      return duplicateGroups.map(([, members]) => {
        const primary = members[0];
        const duplicates = members.slice(1);

        let totalSnapshots = 0;
        for (const m of members) {
          totalSnapshots += (snapshotsByCompany.get(m.id) || []).length;
        }

        const primaryDates = new Set(
          (snapshotsByCompany.get(primary.id) || []).map((s) => s.snapshot_date)
        );
        const conflictingDates = new Set<string>();
        for (const dupe of duplicates) {
          for (const s of snapshotsByCompany.get(dupe.id) || []) {
            if (primaryDates.has(s.snapshot_date)) {
              conflictingDates.add(s.snapshot_date);
            }
          }
        }

        return {
          name: primary.name,
          primary: { id: primary.id, name: primary.name, industry: primary.industry || "", email: primary.email || "" },
          duplicates: duplicates.map((d) => ({
            id: d.id, name: d.name, industry: d.industry || "", email: d.email || "",
          })),
          totalSnapshots,
          conflictingDates: conflictingDates.size,
        };
      });
    },
  });
}

export function useMergeDuplicates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groups: DuplicateGroup[]) => {
      if (!user) throw new Error("Not authenticated");

      let merged = 0;
      let deleted = 0;

      for (const group of groups) {
        const primaryId = group.primary.id;

        // Enrich primary with missing industry/email from duplicates
        const updates: Record<string, string> = {};
        if (!group.primary.industry) {
          const withIndustry = group.duplicates.find((d) => d.industry);
          if (withIndustry) updates.industry = withIndustry.industry;
        }
        if (!group.primary.email) {
          const withEmail = group.duplicates.find((d) => d.email);
          if (withEmail) updates.email = withEmail.email;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("companies").update(updates).eq("id", primaryId);
        }

        // Reassign non-conflicting snapshots from duplicates to primary
        for (const dupe of group.duplicates) {
          const { data: dupeSnapshots } = await supabase
            .from("company_snapshots")
            .select("id, snapshot_date")
            .eq("company_id", dupe.id);

          if (!dupeSnapshots?.length) continue;

          const { data: primarySnapshots } = await supabase
            .from("company_snapshots")
            .select("snapshot_date")
            .eq("company_id", primaryId);

          const primaryDates = new Set(
            (primarySnapshots || []).map((s) => s.snapshot_date)
          );

          const safeIds: string[] = [];
          const conflictIds: string[] = [];

          for (const s of dupeSnapshots) {
            if (primaryDates.has(s.snapshot_date)) {
              conflictIds.push(s.id);
            } else {
              safeIds.push(s.id);
            }
          }

          if (safeIds.length > 0) {
            await supabase
              .from("company_snapshots")
              .update({ company_id: primaryId })
              .in("id", safeIds);
          }

          if (conflictIds.length > 0) {
            await supabase
              .from("company_snapshots")
              .delete()
              .in("id", conflictIds);
          }
        }

        // Delete duplicate company rows
        const dupeIds = group.duplicates.map((d) => d.id);
        const { error: delErr } = await supabase
          .from("companies")
          .delete()
          .in("id", dupeIds);

        if (delErr) {
          console.error(`Failed to delete duplicates for "${group.name}":`, delErr.message);
          continue;
        }

        merged++;
        deleted += dupeIds.length;
      }

      return { merged, deleted };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["duplicate-companies"] });
      queryClient.invalidateQueries({ queryKey: ["raw-snapshots"] });
      toast.success(
        `Merged ${result.merged} duplicate group${result.merged !== 1 ? "s" : ""}, removed ${result.deleted} duplicate record${result.deleted !== 1 ? "s" : ""}`
      );
    },
  });
}
