import { useState, useMemo } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Plus, FileSpreadsheet, Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Built-in fields that map to company columns or well-known snapshot fields
const BUILTIN_FIELDS = [
  { value: "company_name", label: "Company Name", group: "Company" },
  { value: "industry", label: "Industry", group: "Company" },
  { value: "email", label: "Email", group: "Company" },
  { value: "mrr", label: "MRR ($)", group: "Data" },
  { value: "nps", label: "NPS", group: "Data" },
  { value: "lastLogin", label: "Last Login", group: "Data" },
  { value: "supportTickets", label: "Support Tickets", group: "Data" },
  { value: "contractEnd", label: "Contract End", group: "Data" },
  { value: "usageScore", label: "Usage Score", group: "Data" },
];

interface FieldMapping {
  csvHeader: string;
  mappedTo: string; // builtin value, "skip", or "new:<fieldName>"
  newFieldName?: string;
}

interface MappedRow {
  name: string;
  industry: string;
  email: string;
  snapshotData: Record<string, any>;
}

interface CSVFieldMapperProps {
  file: File;
  onComplete: (rows: MappedRow[]) => void;
  onBack: () => void;
}

const CSVFieldMapper = ({ file, onComplete, onBack }: CSVFieldMapperProps) => {
  const [step, setStep] = useState<"mapping" | "preview">("mapping");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [parsed, setParsed] = useState(false);

  // Parse CSV on mount
  useMemo(() => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as Record<string, string>[];
        const hdrs = result.meta.fields || [];
        setCsvData(data);
        setHeaders(hdrs);

        // Auto-map headers using fuzzy matching
        const autoMappings: FieldMapping[] = hdrs.map((h) => {
          const lower = h.toLowerCase().replace(/[_\s-]/g, "");
          let match = "skip";

          if (lower.includes("company") || lower.includes("name") || lower === "account") match = "company_name";
          else if (lower.includes("industry") || lower.includes("sector") || lower.includes("vertical")) match = "industry";
          else if (lower.includes("email") || lower.includes("mail")) match = "email";
          else if (lower.includes("mrr") || lower.includes("revenue") || lower.includes("arr")) match = "mrr";
          else if (lower === "nps" || lower.includes("netscore") || lower.includes("nps")) match = "nps";
          else if (lower.includes("lastlogin") || lower.includes("lastseen") || lower.includes("lastactive")) match = "lastLogin";
          else if (lower.includes("support") || lower.includes("ticket")) match = "supportTickets";
          else if (lower.includes("contract") || lower.includes("renewal")) match = "contractEnd";
          else if (lower.includes("usage") || lower.includes("engagement")) match = "usageScore";

          return { csvHeader: h, mappedTo: match };
        });

        setMappings(autoMappings);
        setParsed(true);
      },
      error: () => {
        toast.error("Failed to parse CSV file");
      },
    });
  }, [file]);

  const updateMapping = (idx: number, value: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      if (value === "__new__") {
        updated[idx] = { ...updated[idx], mappedTo: "new:", newFieldName: "" };
      } else {
        updated[idx] = { ...updated[idx], mappedTo: value, newFieldName: undefined };
      }
      return updated;
    });
  };

  const updateNewFieldName = (idx: number, name: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], mappedTo: `new:${name}`, newFieldName: name };
      return updated;
    });
  };

  const hasCompanyNameMapping = mappings.some((m) => m.mappedTo === "company_name");

  const mappedRows = useMemo((): MappedRow[] => {
    if (!hasCompanyNameMapping) return [];

    return csvData
      .map((row) => {
        let name = "";
        let industry = "";
        let email = "";
        const snapshotData: Record<string, any> = {};

        mappings.forEach((m) => {
          if (m.mappedTo === "skip") return;
          const value = row[m.csvHeader]?.trim() || "";
          if (!value) return;

          if (m.mappedTo === "company_name") {
            name = value;
          } else if (m.mappedTo === "industry") {
            industry = value;
          } else if (m.mappedTo === "email") {
            email = value;
          } else if (m.mappedTo.startsWith("new:")) {
            const fieldName = m.mappedTo.replace("new:", "");
            if (fieldName) {
              const numVal = Number(value);
              snapshotData[fieldName] = isNaN(numVal) ? value : numVal;
            }
          } else {
            // Known data field
            const numVal = Number(value);
            snapshotData[m.mappedTo] = isNaN(numVal) ? value : numVal;
          }
        });

        return name ? { name, industry, email, snapshotData } : null;
      })
      .filter(Boolean) as MappedRow[];
  }, [csvData, mappings, hasCompanyNameMapping]);

  const handleConfirm = () => {
    if (mappedRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    onComplete(mappedRows);
  };

  if (!parsed) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <FileSpreadsheet className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Parsing file…</p>
        </div>
      </div>
    );
  }

  if (step === "mapping") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="font-semibold text-sm">Map Your Fields</h3>
            <p className="text-xs text-muted-foreground">
              {csvData.length} rows found • Match each CSV column to a field
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr,24px,1fr] items-center gap-2 text-xs text-muted-foreground px-1 mb-1">
            <span>CSV Column</span>
            <span />
            <span>Map To</span>
          </div>

          {mappings.map((m, idx) => (
            <div key={m.csvHeader} className="grid grid-cols-[1fr,24px,1fr] items-center gap-2">
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm truncate">
                {m.csvHeader}
                <span className="text-muted-foreground text-xs ml-2">
                  e.g. "{csvData[0]?.[m.csvHeader] || ""}"
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
              <div className="space-y-1">
                <Select
                  value={m.mappedTo.startsWith("new:") ? "__new__" : m.mappedTo}
                  onValueChange={(v) => updateMapping(idx, v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select field…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <X className="h-3 w-3" /> Skip this column
                      </span>
                    </SelectItem>
                    {BUILTIN_FIELDS.map((f) => {
                      const alreadyUsed = mappings.some(
                        (om, oi) => oi !== idx && om.mappedTo === f.value
                      );
                      return (
                        <SelectItem key={f.value} value={f.value} disabled={alreadyUsed}>
                          {f.label}
                          {alreadyUsed && <span className="text-xs text-muted-foreground ml-1">(used)</span>}
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-2 text-primary">
                        <Plus className="h-3 w-3" /> Create new field
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {m.mappedTo.startsWith("new:") && (
                  <Input
                    placeholder="New field name…"
                    value={m.newFieldName || ""}
                    onChange={(e) => updateNewFieldName(idx, e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {!hasCompanyNameMapping && (
          <p className="text-xs text-destructive">
            ⚠ You must map at least one column to "Company Name"
          </p>
        )}

        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-muted-foreground">
            {mappedRows.length} companies will be imported
          </p>
          <div className="flex gap-2">
            <Button variant="heroOutline" size="sm" onClick={onBack}>Cancel</Button>
            <Button
              variant="hero"
              size="sm"
              onClick={() => setStep("preview")}
              disabled={!hasCompanyNameMapping || mappedRows.length === 0}
            >
              Preview Import
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Preview step
  const previewFields = mappings
    .filter((m) => m.mappedTo !== "skip")
    .map((m) => {
      const builtin = BUILTIN_FIELDS.find((f) => f.value === m.mappedTo);
      return {
        key: m.mappedTo.startsWith("new:") ? m.mappedTo.replace("new:", "") : m.mappedTo,
        label: builtin?.label || m.newFieldName || m.mappedTo,
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setStep("mapping")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="font-semibold text-sm">Preview Import</h3>
          <p className="text-xs text-muted-foreground">
            {mappedRows.length} companies ready to import
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden max-h-[45vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {previewFields.map((f) => (
                <TableHead key={f.key} className="text-xs whitespace-nowrap">{f.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappedRows.slice(0, 10).map((row, i) => (
              <TableRow key={i}>
                {previewFields.map((f) => {
                  let val: any;
                  if (f.key === "company_name") val = row.name;
                  else if (f.key === "industry") val = row.industry;
                  else if (f.key === "email") val = row.email;
                  else val = row.snapshotData[f.key] ?? "—";
                  return <TableCell key={f.key} className="text-sm">{String(val)}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {mappedRows.length > 10 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing first 10 of {mappedRows.length} rows
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="heroOutline" size="sm" onClick={() => setStep("mapping")}>Back</Button>
        <Button variant="hero" size="sm" onClick={handleConfirm}>
          <Check className="h-4 w-4 mr-1" /> Import {mappedRows.length} Companies
        </Button>
      </div>
    </div>
  );
};

export default CSVFieldMapper;
