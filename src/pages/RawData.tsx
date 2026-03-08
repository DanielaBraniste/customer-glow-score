import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Database, Calendar, Filter, Settings2, Plus, X, GripVertical } from "lucide-react";
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
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface FieldConfig {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  type: "number" | "date" | "text";
  align: "left" | "right";
  isCustom?: boolean;
}

const defaultFields: FieldConfig[] = [
  { key: "mrr", label: "MRR ($)", weight: 20, enabled: true, type: "number", align: "right" },
  { key: "nps", label: "NPS", weight: 20, enabled: true, type: "number", align: "right" },
  { key: "lastLogin", label: "Last Login", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "supportTickets", label: "Support Tickets", weight: 15, enabled: true, type: "number", align: "right" },
  { key: "contractEnd", label: "Contract End", weight: 10, enabled: true, type: "date", align: "left" },
  { key: "usageScore", label: "Usage Score", weight: 25, enabled: true, type: "number", align: "right" },
];

// Mock raw import data
const mockRawData = [
  { id: 1, date: "2026-03-08", company: "Acme Corp", source: "HubSpot", mrr: 12000, nps: 72, lastLogin: "2026-03-07", supportTickets: 2, contractEnd: "2026-12-01", usageScore: 88, industry: "SaaS" },
  { id: 2, date: "2026-03-08", company: "Globex Inc", source: "Intercom", mrr: 8500, nps: 45, lastLogin: "2026-02-20", supportTickets: 8, contractEnd: "2026-06-15", usageScore: 52, industry: "Fintech" },
  { id: 3, date: "2026-03-08", company: "Initech", source: "CSV", mrr: 24000, nps: 91, lastLogin: "2026-03-08", supportTickets: 0, contractEnd: "2027-03-01", usageScore: 95, industry: "Enterprise" },
  { id: 4, date: "2026-03-08", company: "Umbrella Co", source: "Salesforce", mrr: 5200, nps: 28, lastLogin: "2026-01-15", supportTickets: 14, contractEnd: "2026-04-01", usageScore: 31, industry: "Healthcare" },
  { id: 5, date: "2026-03-08", company: "Stark Industries", source: "Stripe", mrr: 18000, nps: 67, lastLogin: "2026-03-07", supportTickets: 3, contractEnd: "2026-09-15", usageScore: 76, industry: "Manufacturing" },
  { id: 6, date: "2026-03-08", company: "Wayne Enterprises", source: "HubSpot", mrr: 15000, nps: 58, lastLogin: "2026-03-05", supportTickets: 5, contractEnd: "2026-11-01", usageScore: 69, industry: "Conglomerate" },
  { id: 7, date: "2026-03-07", company: "Acme Corp", source: "HubSpot", mrr: 12000, nps: 70, lastLogin: "2026-03-06", supportTickets: 3, contractEnd: "2026-12-01", usageScore: 85, industry: "SaaS" },
  { id: 8, date: "2026-03-07", company: "Globex Inc", source: "Intercom", mrr: 8500, nps: 47, lastLogin: "2026-02-18", supportTickets: 7, contractEnd: "2026-06-15", usageScore: 54, industry: "Fintech" },
  { id: 9, date: "2026-03-07", company: "Umbrella Co", source: "Salesforce", mrr: 5200, nps: 30, lastLogin: "2026-01-12", supportTickets: 12, contractEnd: "2026-04-01", usageScore: 33, industry: "Healthcare" },
  { id: 10, date: "2026-03-06", company: "Stark Industries", source: "Stripe", mrr: 18000, nps: 65, lastLogin: "2026-03-05", supportTickets: 4, contractEnd: "2026-09-15", usageScore: 74, industry: "Manufacturing" },
];

const allDates = [...new Set(mockRawData.map((r) => r.date))].sort().reverse();
const allSources = [...new Set(mockRawData.map((r) => r.source))].sort();

const getValueColor = (key: string, val: number) => {
  if (key === "nps" || key === "usageScore") {
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

  const filtered = mockRawData.filter((r) => {
    if (search && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFilter !== "all" && r.date !== dateFilter) return false;
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    return true;
  });

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
                <SelectItem key={s} value={s}>{s}</SelectItem>
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
                  <TableHead className="sticky left-0 bg-card z-10">Date</TableHead>
                  <TableHead className="sticky left-[100px] bg-card z-10">Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Industry</TableHead>
                  {enabledFields.map((field) => (
                    <TableHead key={field.key} className={field.align === "right" ? "text-right" : ""}>
                      <div className="flex flex-col gap-0.5">
                        <span>{field.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground/70">{field.weight}%</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="sticky left-0 bg-card text-muted-foreground text-xs font-mono">{row.date}</TableCell>
                    <TableCell className="sticky left-[100px] bg-card font-medium">{row.company}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {row.source}
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
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4 + enabledFields.length} className="text-center text-muted-foreground py-12">
                      No records found matching your filters.
                    </TableCell>
                  </TableRow>
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
