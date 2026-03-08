import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, Plus, Search, Building2, TrendingUp, TrendingDown, Minus, Database } from "lucide-react";
import { Zap } from "lucide-react";
import UserProfile from "@/components/UserProfile";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import AddCompanyDialog from "@/components/AddCompanyDialog";

const mockCompanies = [
  { id: 1, name: "Acme Corp", industry: "SaaS", healthScore: 87, trend: "up", lastUpdate: "2 hours ago", status: "Healthy" },
  { id: 2, name: "Globex Inc", industry: "Fintech", healthScore: 64, trend: "down", lastUpdate: "5 hours ago", status: "At Risk" },
  { id: 3, name: "Initech", industry: "Enterprise", healthScore: 92, trend: "up", lastUpdate: "1 hour ago", status: "Healthy" },
  { id: 4, name: "Umbrella Co", industry: "Healthcare", healthScore: 45, trend: "down", lastUpdate: "3 hours ago", status: "Critical" },
  { id: 5, name: "Stark Industries", industry: "Manufacturing", healthScore: 78, trend: "stable", lastUpdate: "30 min ago", status: "Healthy" },
  { id: 6, name: "Wayne Enterprises", industry: "Conglomerate", healthScore: 71, trend: "stable", lastUpdate: "4 hours ago", status: "Monitor" },
];

const getTrendIcon = (trend: string) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-primary" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
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

  const handleAddCompany = (company: { name: string; industry: string; fields: { key: string; value: string }[] }) => {
    console.log("Add company:", company);
    // TODO: persist to database
  };

  const handleUploadCSV = (file: File) => {
    console.log("Upload CSV:", file.name);
    // TODO: parse and persist
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const filtered = mockCompanies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
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
            { label: "Companies", value: "6", icon: Building2 },
            { label: "Avg Score", value: "73", icon: TrendingUp },
            { label: "At Risk", value: "2", icon: TrendingDown },
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
          onAddCompany={handleAddCompany}
          onUploadCSV={handleUploadCSV}
        />

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id} className="cursor-pointer">
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell className="text-muted-foreground">{company.industry}</TableCell>
                  <TableCell>
                    <span className={`font-semibold ${getScoreColor(company.healthScore)}`}>
                      {company.healthScore}
                    </span>
                  </TableCell>
                  <TableCell>{getTrendIcon(company.trend)}</TableCell>
                  <TableCell>{getStatusBadge(company.status)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {company.lastUpdate}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No companies found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
