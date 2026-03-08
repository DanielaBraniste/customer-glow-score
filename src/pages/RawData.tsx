import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Database, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState } from "react";

// Mock raw import data — will be replaced with real data from import_logs + company attributes
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

  const filtered = mockRawData.filter((r) => {
    if (search && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFilter !== "all" && r.date !== dateFilter) return false;
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    return true;
  });

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

        {/* Filters */}
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
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
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
                  <TableHead className="text-right">MRR ($)</TableHead>
                  <TableHead className="text-right">NPS</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Support Tickets</TableHead>
                  <TableHead>Contract End</TableHead>
                  <TableHead className="text-right">Usage Score</TableHead>
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
                    <TableCell className="text-right font-mono">{row.mrr.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-semibold ${getValueColor("nps", row.nps)}`}>{row.nps}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{row.lastLogin}</TableCell>
                    <TableCell className={`text-right font-semibold ${getValueColor("supportTickets", row.supportTickets)}`}>{row.supportTickets}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{row.contractEnd}</TableCell>
                    <TableCell className={`text-right font-semibold ${getValueColor("usageScore", row.usageScore)}`}>{row.usageScore}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
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
