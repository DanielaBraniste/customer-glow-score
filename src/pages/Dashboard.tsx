import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, Plus, Search, Building2, TrendingUp, TrendingDown, Minus, Database, Loader2 } from "lucide-react";
import { Zap } from "lucide-react";
import UserProfile from "@/components/UserProfile";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useMemo, useState } from "react";
import AddCompanyDialog from "@/components/AddCompanyDialog";
import DeduplicateBanner from "@/components/DeduplicateBanner";
import { calculateHealthScore, DEFAULT_SCORE_FIELDS } from "@/lib/healthScore";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompanies } from "@/hooks/useCompanies";

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
  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

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
            <Button variant="heroOutline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Companies", value: String(companies.length), icon: Building2 },
              { label: "Avg Score", value: String(avgScore), icon: TrendingUp },
              { label: "At Risk", value: String(atRiskCount), icon: TrendingDown },
              { label: "Connections", value: "3", icon: Plus },
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
          <div className="flex items-center justify-between mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="heroOutline" size="sm" onClick={() => navigate("/raw-data")}>
                <Database className="h-4 w-4 mr-2" /> Raw Data
              </Button>
              <Button variant="heroOutline" size="sm" onClick={() => navigate("/connectors")}>
                <Zap className="h-4 w-4 mr-2" /> Automated Import
              </Button>
              <Button variant="hero" size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Company
              </Button>
            </div>
          </div>

          <AddCompanyDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
          />

          {/* Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Health Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {companies.length === 0
                        ? "No companies yet. Add one manually or import via CSV."
                        : "No companies found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((company) => (
                    <TableRow key={company.id} className="cursor-pointer">
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
