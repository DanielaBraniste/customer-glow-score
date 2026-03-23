import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Database, Calendar, Filter, Settings2, Plus, X, GripVertical, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Sort utilities ──────────────────────────────────────────────
type SortDirection = "asc" | "desc" | null;
interface SortConfig { key: string; direction: SortDirection; }

const handleSortToggle = (prev: SortConfig, key: string): SortConfig => {
  if (prev.key !== key) return { key, direction: "asc" };
  if (prev.direction === "asc") return { key, direction: "desc" };
  if (prev.direction === "desc") return { key: "", direction: null };
  return { key, direction: "asc" };
};

const sortRows = <T extends Record<string, any>>(rows: T[], config: SortConfig): T[] => {
  if (!config.key || !config.direction) return rows;
  return [...rows].sort((a, b) => {
    let aVal = a[config.key];
    let bVal = b[config.key];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") {
      return config.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    if (aVal < bVal) return config.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return config.direction === "asc" ? 1 : -1;
    return 0;
  });
};

const SortableHead = ({
  label, sortKey, currentSort, onSort, className = "",
}: {
  label: string; sortKey: string; currentSort: SortConfig; onSort: (key: string) => void; className?: string;
}) => {
  const isActive = currentSort.key === sortKey;
  const Icon = isActive
    ? currentSort.direction === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 hover:text-foreground transition-colors px-1 py-0.5 rounded ${className?.includes("text-right") ? "ml-auto" : "-ml-1"}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground/40"}`} />
      </button>
    </TableHead>
  );
};

// ── Field & source config ───────────────────────────────────────
interface FieldConfig {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  type: "number" | "date" | "text";
  align: "left" | "right";
  isCustom?: boolean;
  min?: number;
  max?: number;
}

const defaultFields: FieldConfig[] = [
  { key: "mrr", label: "MRR ($)", weight: 20, enabled: true, type: "number", align: "right" },
  { key: "nps", label: "NPS", weight: 20, enabled: true, type: "number", align: "right", min: -100, max: 100 },
  { key: "lastLogin", label: "Last Login", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "supportTickets", label: "Support Tickets", weight: 15, enabled: true, type: "number", align: "right" },
  { key: "contractEnd", label: "Contract End", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "usageScore", label: "Usage Score", weight: 25, enabled: true, type: "number", align: "right" },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  csv: "CSV",
  hubspot: "HubSpot",
  intercom: "Intercom",
  salesforce: "Salesforce",
  zendesk: "Zendesk",
  pipedrive: "Pipedrive",
  stripe: "Stripe",
  segment: "Segment",
  slack: "Slack",
};

const getSourceLabel = (source: string): string =>
  SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);

const KNOWN_NON_METRIC_KEYS = new Set(["id", "date", "company", "industry", "source"]);

const getValueColor = (key: string, val: number) => {
  if (key === "nps") {
    if (val > 50) return "text-primary";
    if (val >= 0) return "text-yellow-400";
    return "text-destructive";
  }
  if (key === "usageScore") {
    if (val >= 80) return "text-primary";
    if (val >= 50) return "text-yellow-400";
    return "text-destructive";
  }
  if (key === "supportTickets") {
    if (val <= 2) return "text-primary";
    if (val <= 6) return "text-yellow-400";
    return "text-destructive";
  }
  return "";
};

const RawData = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fields, setFields] = useState<FieldConfig[]>(defaultFields);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"number" | "date" | "text">("number");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sort, setSort] = useState<SortConfig>({ key: "", direction: null });

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["raw-snapshots", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: snaps, error: sErr } = await supabase
        .from("company_snapshots")
        .select("id, company_id, snapshot_date, source, data, created_at")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false });

      if (sErr) throw sErr;

      // Fetch ALL companies (default limit is 1000, so paginate)
      let allCompanies: { id: string; name: string; industry: string | null }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch, error: cErr } = await supabase
          .from("companies")
          .select("id, name, industry")
          .eq("user_id", user!.id)
          .range(from, from + pageSize - 1);
        if (cErr) throw cErr;
        if (!batch || batch.length === 0) break;
        allCompanies = allCompanies.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      if (cErr) throw cErr;

      const companyMap = new Map<string, { id: string; name: string; industry: string | null }>(companies?.map((c) => [c.id, c]) || []);

      return (snaps || []).map((s) => {
        const company = companyMap.get(s.company_id);
        return {
          id: s.id,
          date: s.snapshot_date,
          company: company?.name || "Unknown",
          industry: company?.industry || "",
          source: s.source || "manual",
          ...((s.data as Record<string, any>) || {}),
        };
      });
    },
  });

  const rows = snapshots || [];
  const allDates = useMemo(() => [...new Set(rows.map((r) => r.date))].sort().reverse(), [rows]);
  const allSources = useMemo(() => [...new Set(rows.map((r) => r.source))].sort(), [rows]);

  const discoveredKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      Object.keys(row).forEach((k) => {
        if (!KNOWN_NON_METRIC_KEYS.has(k)) {
          keys.add(k);
        }
      });
    }
    return keys;
  }, [rows]);

  useEffect(() => {
    if (discoveredKeys.size === 0) return;
    setFields((prev) => {
      const existingKeys = new Set(prev.map((f) => f.key));
      const newFields = [...discoveredKeys]
        .filter((k) => !existingKeys.has(k))
        .map((k) => ({
          key: k,
          label: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          weight: 10,
          enabled: true,
          type: "text" as const,
          align: "left" as const,
          isCustom: true,
        }));
      return newFields.length > 0 ? [...prev, ...newFields] : prev;
    });
  }, [discoveredKeys]);

  const enabledFields = fields.filter((f) => f.enabled);
  const totalWeight = enabledFields.reduce((sum, f) => sum + f.weight, 0);

  const toggleField = (key: string) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
  };

  const updateWeight = (key: string, weight: number) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, weight } : f)));
  };

  const removeField = (key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key));
    toast.success("Field removed");
  };

  const addCustomField = () => {
    if (!newFieldName.trim()) return;
    const key = newFieldName.toLowerCase().replace(/\s+/g, "_");
    if (fields.some((f) => f.key === key)) {
      toast.error("Field already exists");
      return;
    }
    setFields((prev) => [
      ...prev,
      {
        key,
        label: newFieldName.trim(),
        weight: 10,
        enabled: true,
        type: newFieldType,
        align: newFieldType === "number" ? "right" : "left",
        isCustom: true,
      },
    ]);
    setNewFieldName("");
    setNewFieldType("number");
    setAddDialogOpen(false);
    toast.success("Field added");
  };

  const handleSort = (key: string) => setSort((prev) => handleSortToggle(prev, key));

  const filtered = sortRows(
    rows.filter((r) => {
      if (search && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateFilter !== "all" && r.date !== dateFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      return true;
    }),
    sort
  );

  const getCellValue = (row: Record<string, any>, key: string) => {
    const val = row[key];
    if (val === undefined || val === null) return "—";
    if (typeof val === "number") return val.toLocaleString();
    return val;
  };

  return (
    <div className="min-h-screen bg-background pt-20 px-6 pb-16">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Raw Import Data</h1>
          </div>
          <p className="text-muted-foreground max-w-xl">
            View all imported data points used for health score calculations. Each row represents a daily snapshot per company.
          </p>
        </div>

        {/* Filters + Field Config */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative w-56">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-44">
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              {allDates.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {allSources.map((s) => (
                <SelectItem key={s} value={s}>{getSourceLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </span>

            {/* Field Configuration Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configure Fields
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Field Configuration</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-1">
                  {/* Weight summary */}
                  <div className="flex items-center justify-between text-xs mb-4">
                    <span className="text-muted-foreground">Total weight of enabled fields</span>
                    <span className={`font-mono font-semibold ${totalWeight === 100 ? "text-primary" : "text-destructive"}`}>
                      {totalWeight}%{totalWeight !== 100 && " (should be 100%)"}
                    </span>
                  </div>

                  {/* Fields list */}
                  {fields.map((field) => (
                    <div
                      key={field.key}
                      className={`rounded-lg border border-border p-4 transition-colors ${
                        field.enabled ? "bg-card" : "bg-muted/30 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                          <span className="font-medium text-sm">{field.label}</span>
                          {field.isCustom && (
                            <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                              Custom
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {field.isCustom && (
                            <button
                              onClick={() => removeField(field.key)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <Switch
                            checked={field.enabled}
                            onCheckedChange={() => toggleField(field.key)}
                          />
                        </div>
                      </div>

                      {field.enabled && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <Label className="text-muted-foreground">Weight</Label>
                            <span className="font-mono font-semibold text-foreground">{field.weight}%</span>
                          </div>
                          <Slider
                            value={[field.weight]}
                            onValueChange={([v]) => updateWeight(field.key, v)}
                            max={100}
                            min={0}
                            step={5}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add field button */}
                  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                    <DialogTrigger asChild>
                      <button className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                        <Plus className="h-4 w-4" /> Add Custom Field
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Custom Field</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Field Name</Label>
                          <Input
                            placeholder="e.g. Expansion Revenue"
                            value={newFieldName}
                            onChange={(e) => setNewFieldName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Field Type</Label>
                          <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as any)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="text">Text</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={addCustomField} disabled={!newFieldName.trim()}>
                          Add Field
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead label="Date" sortKey="date" currentSort={sort} onSort={handleSort} className="sticky left-0 bg-card z-10" />
                  <SortableHead label="Company" sortKey="company" currentSort={sort} onSort={handleSort} className="sticky left-[100px] bg-card z-10" />
                  <SortableHead label="Source" sortKey="source" currentSort={sort} onSort={handleSort} />
                  <SortableHead label="Industry" sortKey="industry" currentSort={sort} onSort={handleSort} />
                  {enabledFields.map((field) => (
                    <TableHead key={field.key} className={field.align === "right" ? "text-right" : ""}>
                      <button
                        onClick={() => handleSort(field.key)}
                        className="flex flex-col gap-0.5 hover:text-foreground transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          {field.label}
                          {sort.key === field.key ? (
                            sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
                          )}
                        </span>
                        <span className="text-[10px] font-normal text-muted-foreground/70">{field.weight}%</span>
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4 + enabledFields.length} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4 + enabledFields.length} className="text-center text-muted-foreground py-12">
                      {rows.length === 0
                        ? "No import data yet. Add companies manually, upload a CSV, or connect an integration."
                        : "No records found matching your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="sticky left-0 bg-card text-muted-foreground text-xs font-mono">{row.date}</TableCell>
                      <TableCell className="sticky left-[100px] bg-card font-medium">{row.company}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {getSourceLabel(row.source)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.industry}</TableCell>
                      {enabledFields.map((field) => {
                        const val = (row as Record<string, any>)[field.key];
                        const colorClass = typeof val === "number" ? getValueColor(field.key, val) : "";
                        return (
                          <TableCell
                            key={field.key}
                            className={`${field.align === "right" ? "text-right" : ""} ${
                              typeof val === "number" ? "font-semibold" : "text-muted-foreground text-xs font-mono"
                            } ${colorClass}`}
                          >
                            {getCellValue(row, field.key)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RawData;
