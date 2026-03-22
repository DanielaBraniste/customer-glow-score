import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, Plus, Search, Building2, TrendingUp, TrendingDown, Minus, Database, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Sun, Moon, Download, Trash2, Pencil, MoreHorizontal, CheckSquare } from "lucide-react";
import { Zap } from "lucide-react";
import UserProfile from "@/components/UserProfile";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AddCompanyDialog from "@/components/AddCompanyDialog";
import DeduplicateBanner from "@/components/DeduplicateBanner";
import { calculateHealthScore, DEFAULT_SCORE_FIELDS } from "@/lib/healthScore";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompanies, useDeleteCompany, useEditCompany, useBulkDeleteCompanies, useBulkEditCompanies } from "@/hooks/useCompanies";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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

// ── Dashboard helpers ───────────────────────────────────────────
const getStatus = (score: number) => {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Monitor";
  if (score >= 40) return "At Risk";
  return "Critical";
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-yellow-400";
  return "text-destructive";
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    Healthy: "bg-primary/15 text-primary border-primary/20",
    "At Risk": "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    Critical: "bg-destructive/15 text-destructive border-destructive/20",
    Monitor: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] || ""}`}>
      {status}
    </span>
  );
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sort, setSort] = useState<SortConfig>({ key: "", direction: null });
  const [activeConnections, setActiveConnections] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; industry: string; email: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState<{ industry: string; email: string }>({ industry: "", email: "" });
  const [bulkEditFields, setBulkEditFields] = useState<{ industry: boolean; email: boolean }>({ industry: false, email: false });

  const deleteCompany = useDeleteCompany();
  const editCompany = useEditCompany();
  const bulkDelete = useBulkDeleteCompanies();
  const bulkEdit = useBulkEditCompanies();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_connectors")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .then(({ count }) => setActiveConnections(count || 0));
  }, [user]);

  const { data: rawCompanies = [], isLoading } = useCompanies();

  const companies = useMemo(() => {
    return rawCompanies.map((c) => {
      const scoreData = {
        ...c.snapshotData,
        industry: c.industry,
      };
      const result = calculateHealthScore(scoreData, DEFAULT_SCORE_FIELDS);
      return {
        ...c,
        healthScore: result.total,
        breakdown: result.breakdown,
        status: getStatus(result.total),
        lastLogin: (c.snapshotData?.lastLogin as string) || "—",
      };
    });
  }, [rawCompanies]);

  const avgScore = companies.length
    ? Math.round(companies.reduce((s, c) => s + c.healthScore, 0) / companies.length)
    : 0;
  const atRiskCount = companies.filter((c) => c.healthScore < 60).length;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleSort = (key: string) => setSort((prev) => handleSortToggle(prev, key));

  const filtered = sortRows(
    companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    sort
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const handleDownloadCSV = () => {
    if (filtered.length === 0) return;
    const headers = ["Company", "Health Score", "Status", "MRR", "NPS", "Last Login", "Support Tickets", "Contract End", "Usage Score", "Industry"];
    const rows = filtered.map((c) => [
      c.name,
      c.healthScore,
      c.status,
      c.snapshotData?.mrr ?? "",
      c.snapshotData?.nps ?? "",
      c.snapshotData?.lastLogin ?? "",
      c.snapshotData?.supportTickets ?? "",
      c.snapshotData?.contractEnd ?? "",
      c.snapshotData?.usageScore ?? "",
      c.industry || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-scores-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background pt-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <UserProfile />
              <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground text-sm">Welcome, {user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="text-muted-foreground hover:text-foreground">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="heroOutline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Companies", value: String(companies.length), icon: Building2 },
              { label: "Avg Score", value: String(avgScore), icon: TrendingUp },
              { label: "At Risk", value: String(atRiskCount), icon: TrendingDown },
              { label: "Connections", value: String(activeConnections), icon: Plus },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <stat.icon className="h-4 w-4" />
                  {stat.label}
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="heroOutline" size="sm" onClick={() => navigate("/health-progression")}>
                <TrendingUp className="h-4 w-4 mr-1" /> HS Progression
              </Button>
              <Button variant="heroOutline" size="sm" onClick={() => navigate("/raw-data")}>
                <Database className="h-4 w-4 mr-1" /> Raw Data
              </Button>
              <Button variant="heroOutline" size="sm" onClick={() => navigate("/connectors")}>
                <Zap className="h-4 w-4 mr-1" /> Automated Import
              </Button>
              <Button variant="heroOutline" size="sm" onClick={handleDownloadCSV} disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
              <Button variant="hero" size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Company
              </Button>
            </div>
          </div>

          <AddCompanyDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
          />

          <DeduplicateBanner />

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="heroOutline"
                  size="sm"
                  onClick={() => {
                    setBulkEditData({ industry: "", email: "" });
                    setBulkEditFields({ industry: false, email: false });
                    setBulkEditOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Bulk Edit
                </Button>
                <Button
                  variant="heroOutline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <SortableHead label="Company" sortKey="name" currentSort={sort} onSort={handleSort} />
                  <SortableHead label="Industry" sortKey="industry" currentSort={sort} onSort={handleSort} />
                  <SortableHead label="Health Score" sortKey="healthScore" currentSort={sort} onSort={handleSort} />
                  <SortableHead label="Status" sortKey="healthScore" currentSort={sort} onSort={handleSort} />
                  <SortableHead label="Last Login" sortKey="lastLogin" currentSort={sort} onSort={handleSort} className="text-right" />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {companies.length === 0
                        ? "No companies yet. Add one manually or import via CSV."
                        : "No companies found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((company) => (
                    <TableRow key={company.id} className={`cursor-pointer ${selected.has(company.id) ? "bg-primary/5" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(company.id)}
                          onCheckedChange={() => toggleSelect(company.id)}
                          aria-label={`Select ${company.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell className="text-muted-foreground">{company.industry}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`font-semibold cursor-help ${getScoreColor(company.healthScore)}`}>
                              {company.healthScore}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Score Breakdown</p>
                            <div className="space-y-0.5 text-xs">
                              {company.breakdown.map((b) => (
                                <div key={b.field} className="flex justify-between gap-4">
                                  <span className="text-muted-foreground capitalize">{b.field.replace(/([A-Z])/g, " $1")}</span>
                                  <span>{b.fieldScore} × {b.weight}% = <span className="font-medium">{b.contribution}</span></span>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{getStatusBadge(company.status)}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {company.lastLogin}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditTarget({ id: company.id, name: company.name, industry: company.industry, email: company.email })}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: company.id, name: company.name })}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Delete confirmation */}
          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this company and all its snapshot data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (deleteTarget) {
                      deleteCompany.mutate(deleteTarget.id);
                      setDeleteTarget(null);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit dialog */}
          <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Company</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={editTarget?.name || ""} onChange={(e) => setEditTarget((prev) => prev ? { ...prev, name: e.target.value } : null)} />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input value={editTarget?.industry || ""} onChange={(e) => setEditTarget((prev) => prev ? { ...prev, industry: e.target.value } : null)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editTarget?.email || ""} onChange={(e) => setEditTarget((prev) => prev ? { ...prev, email: e.target.value } : null)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button
                  disabled={!editTarget?.name?.trim()}
                  onClick={() => {
                    if (editTarget) {
                      editCompany.mutate(editTarget);
                      setEditTarget(null);
                    }
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk delete confirmation */}
          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.size} {selected.size === 1 ? "company" : "companies"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected {selected.size === 1 ? "company" : "companies"} and all associated snapshot data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    bulkDelete.mutate(Array.from(selected));
                    setSelected(new Set());
                    setBulkDeleteOpen(false);
                  }}
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk edit dialog */}
          <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bulk Edit {selected.size} {selected.size === 1 ? "Company" : "Companies"}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Check the fields you want to update. Only checked fields will be changed across all selected companies.
              </p>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={bulkEditFields.industry} onCheckedChange={(v) => setBulkEditFields((p) => ({ ...p, industry: !!v }))} id="bulk-industry" />
                    <Label htmlFor="bulk-industry">Industry</Label>
                  </div>
                  {bulkEditFields.industry && (
                    <Input placeholder="New industry value (leave empty to clear)" value={bulkEditData.industry} onChange={(e) => setBulkEditData((p) => ({ ...p, industry: e.target.value }))} />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={bulkEditFields.email} onCheckedChange={(v) => setBulkEditFields((p) => ({ ...p, email: !!v }))} id="bulk-email" />
                    <Label htmlFor="bulk-email">Email</Label>
                  </div>
                  {bulkEditFields.email && (
                    <Input placeholder="New email value (leave empty to clear)" value={bulkEditData.email} onChange={(e) => setBulkEditData((p) => ({ ...p, email: e.target.value }))} />
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Cancel</Button>
                <Button
                  disabled={!bulkEditFields.industry && !bulkEditFields.email}
                  onClick={() => {
                    const updates: { industry?: string; email?: string } = {};
                    if (bulkEditFields.industry) updates.industry = bulkEditData.industry;
                    if (bulkEditFields.email) updates.email = bulkEditData.email;
                    bulkEdit.mutate({ companyIds: Array.from(selected), updates });
                    setSelected(new Set());
                    setBulkEditOpen(false);
                  }}
                >
                  Apply to {selected.size} {selected.size === 1 ? "Company" : "Companies"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
