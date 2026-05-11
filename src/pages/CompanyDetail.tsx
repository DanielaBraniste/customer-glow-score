import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Building2, Mail, Briefcase, Calendar, Loader2, TrendingUp, History, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateHealthScore, DEFAULT_SCORE_FIELDS } from "@/lib/healthScore";
import { useScoreFields } from "@/hooks/useScoreFields";
import { toScoreFields } from "@/lib/scoreFields";
import UserProfile from "@/components/UserProfile";
import { useMemo } from "react";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  csv: "CSV Import",
  stripe: "Stripe",
  hubspot: "HubSpot",
  intercom: "Intercom",
  zendesk: "Zendesk",
  salesforce: "Salesforce",
  mixpanel: "Mixpanel",
  amplitude: "Amplitude",
};

const getStatus = (score: number) => {
  if (score >= 80) return { label: "Healthy", cls: "bg-primary/15 text-primary border-primary/20" };
  if (score >= 60) return { label: "Monitor", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
  if (score >= 40) return { label: "At Risk", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
  return { label: "Critical", cls: "bg-destructive/15 text-destructive border-destructive/20" };
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-yellow-400";
  return "text-destructive";
};

const formatValue = (v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
};

const CompanyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["company-detail", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data: company, error: cErr } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!company) return null;

      const { data: snapshots, error: sErr } = await supabase
        .from("company_snapshots")
        .select("*")
        .eq("company_id", id!)
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false });
      if (sErr) throw sErr;

      return { company, snapshots: snapshots || [] };
    },
  });

  const allFieldKeys = useMemo(() => {
    if (!data?.snapshots) return [] as string[];
    const keys = new Set<string>();
    for (const s of data.snapshots) {
      const d = (s.data as Record<string, any>) || {};
      Object.keys(d).forEach((k) => keys.add(k));
    }
    // Preferred ordering: known fields first
    const known = ["mrr", "nps", "lastLogin", "supportTickets", "contractEnd", "usageScore"];
    const ordered = [...known.filter((k) => keys.has(k)), ...[...keys].filter((k) => !known.includes(k))];
    return ordered;
  }, [data]);

  const latestSnapshot = data?.snapshots[0];
  const scoreResult = useMemo(() => {
    if (!latestSnapshot) return null;
    return calculateHealthScore(
      { ...(latestSnapshot.data as Record<string, any>), industry: data?.company.industry },
      DEFAULT_SCORE_FIELDS
    );
  }, [latestSnapshot, data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-20 px-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background pt-20 px-6">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Company not found or you don't have access to it.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { company, snapshots } = data;
  const status = scoreResult ? getStatus(scoreResult.total) : null;

  return (
    <div className="min-h-screen bg-background pt-20 px-6 pb-12">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UserProfile />
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        </div>

        {/* Company info card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{company.name}</CardTitle>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                    {company.industry && (
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" /> {company.industry}
                      </span>
                    )}
                    {company.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> {company.email}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> Added {new Date(company.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              {scoreResult && status && (
                <div className="text-right">
                  <div className={`text-4xl font-bold ${getScoreColor(scoreResult.total)}`}>
                    {scoreResult.total}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium mt-1 ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <History className="h-4 w-4" /> Snapshots
            </div>
            <p className="text-2xl font-bold">{snapshots.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Calendar className="h-4 w-4" /> Latest snapshot
            </div>
            <p className="text-lg font-semibold">
              {latestSnapshot ? new Date(latestSnapshot.snapshot_date).toLocaleDateString() : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Database className="h-4 w-4" /> Latest source
            </div>
            <p className="text-lg font-semibold">
              {latestSnapshot ? (SOURCE_LABELS[latestSnapshot.source] || latestSnapshot.source) : "—"}
            </p>
          </div>
        </div>

        {/* Score breakdown */}
        {scoreResult && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Health Score Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Raw Value</TableHead>
                    <TableHead className="text-right">Field Score</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scoreResult.breakdown.map((b) => (
                    <TableRow key={b.field}>
                      <TableCell className="capitalize font-medium">
                        {b.field.replace(/([A-Z])/g, " $1")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatValue(b.rawValue)}</TableCell>
                      <TableCell className={`text-right font-semibold ${getScoreColor(b.fieldScore)}`}>{b.fieldScore}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{b.weight}%</TableCell>
                      <TableCell className="text-right font-semibold">{b.contribution}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Snapshot history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> All Inputs &amp; Snapshots
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No snapshots yet for this company.{" "}
                <Link to="/raw-data" className="text-primary hover:underline">Add data</Link> to start tracking.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      {allFieldKeys.map((k) => (
                        <TableHead key={k} className="capitalize whitespace-nowrap">
                          {k.replace(/([A-Z])/g, " $1")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s) => {
                      const d = (s.data as Record<string, any>) || {};
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {new Date(s.snapshot_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                              {SOURCE_LABELS[s.source] || s.source}
                            </span>
                          </TableCell>
                          {allFieldKeys.map((k) => (
                            <TableCell key={k} className="whitespace-nowrap text-sm">
                              {formatValue(d[k])}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanyDetail;
