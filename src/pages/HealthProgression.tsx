import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, ArrowLeft, Sun, Moon, Loader2, Search, Info } from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState, useMemo } from "react";
import { useHealthProgression, TimeGranularity } from "@/hooks/useHealthProgression";
import UserProfile from "@/components/UserProfile";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-yellow-400";
  return "text-destructive";
};

const getScoreBg = (score: number) => {
  if (score >= 80) return "bg-primary/10";
  if (score >= 60) return "bg-yellow-400/10";
  return "bg-destructive/10";
};

const getTrend = (scores: Record<string, number>, periods: string[]) => {
  const values = periods.map((p) => scores[p]).filter((v) => v !== undefined);
  if (values.length < 2) return null;
  const diff = values[values.length - 1] - values[values.length - 2];
  return diff;
};

const formatMrr = (mrr: number) => {
  if (mrr >= 1000) return `$${(mrr / 1000).toFixed(1)}k`;
  return `$${mrr}`;
};

const HealthProgression = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [granularity, setGranularity] = useState<TimeGranularity>("week");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useHealthProgression(granularity);
  const companies = data?.companies || [];
  const periods = data?.periods || [];

  const filtered = useMemo(
    () => companies.filter((c) => c.companyName.toLowerCase().includes(search.toLowerCase())),
    [companies, search]
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background pt-20 px-6">
        <div className="max-w-[90rem] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <UserProfile />
              <div>
                <h1 className="text-2xl font-bold">Health Score Progression</h1>
                <p className="text-muted-foreground text-sm">
                  Track how your customers' health evolves over time
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="heroOutline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Dashboard
              </Button>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as TimeGranularity)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day by Day</SelectItem>
                <SelectItem value="week">Week by Week</SelectItem>
                <SelectItem value="month">Month by Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-10 bg-card min-w-[180px]">Company</TableHead>
                    <TableHead className="min-w-[120px]">Customer Since</TableHead>
                    <TableHead className="min-w-[100px] text-right">MRR</TableHead>
                    <TableHead className="min-w-[100px] text-right">ARR</TableHead>
                    <TableHead className="min-w-[80px] text-center">Trend</TableHead>
                    {periods.map((period) => (
                      <TableHead key={period} className="min-w-[80px] text-center text-xs">
                        {period}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5 + periods.length} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5 + periods.length} className="text-center text-muted-foreground py-8">
                        {companies.length === 0
                          ? "No snapshot data available. Import data from the Dashboard first."
                          : "No companies found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((company) => {
                      const trend = getTrend(company.scores, periods);
                      return (
                        <TableRow key={company.companyId}>
                          <TableCell className="font-medium sticky left-0 z-10 bg-card">
                            {company.companyName}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {company.customerSince}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMrr(company.currentMrr)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMrr(company.currentMrr * 12)}
                          </TableCell>
                          <TableCell className="text-center">
                            {trend !== null ? (
                              <span
                                className={`text-xs font-semibold ${
                                  trend > 0 ? "text-primary" : trend < 0 ? "text-destructive" : "text-muted-foreground"
                                }`}
                              >
                                {trend > 0 ? "▲" : trend < 0 ? "▼" : "—"} {Math.abs(trend)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {periods.map((period) => {
                            const score = company.scores[period];
                            if (score === undefined) {
                              return (
                                <TableCell key={period} className="text-center text-muted-foreground/40 text-sm">
                                  —
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={period} className="text-center p-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={`inline-flex items-center justify-center w-10 h-7 rounded-md text-xs font-semibold cursor-help ${getScoreBg(score)} ${getScoreColor(score)}`}
                                    >
                                      {score}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">
                                      {company.companyName} — {period}: <span className="font-bold">{score}</span>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default HealthProgression;
