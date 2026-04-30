import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Building2, Plus, X, FileSpreadsheet, ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import CSVFieldMapper from "./CSVFieldMapper";
import { useAddCompany, useBulkAddCompanies, useCompanies } from "@/hooks/useCompanies";
import { FREE_PLAN_LIMITS } from "@/lib/planLimits";

// Fix 3: file size limit
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Fix 2 & 3: shared validation helper
const validateUploadFile = (file: File): string | null => {
  const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
  if (!isCsv) {
    return "Only CSV files are supported. XLSX support is coming soon.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
};

interface CustomField {
  key: string;
  value: string;
  weight: number;
}

interface AddCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "choose" | "manual" | "upload" | "mapping";

const calcDefaultWeight = (scoredCount: number) =>
  Math.round((100 / Math.max(scoredCount, 1)) * 10) / 10;

const AddCompanyDialog = ({ open, onOpenChange }: AddCompanyDialogProps) => {
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const initWeight = calcDefaultWeight(4);
  const [industry, setIndustry] = useState("");
  const [industryScored, setIndustryScored] = useState(true);
  const [industryWeight, setIndustryWeight] = useState(initWeight);
  const [email, setEmail] = useState("");
  const [mrr, setMrr] = useState("");
  const [mrrScored, setMrrScored] = useState(true);
  const [mrrWeight, setMrrWeight] = useState(initWeight);
  const [lastLogin, setLastLogin] = useState("");
  const [lastLoginWeight, setLastLoginWeight] = useState(initWeight);
  const [customFields, setCustomFields] = useState<CustomField[]>([{ key: "", value: "", weight: initWeight }]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addCompanyMutation = useAddCompany();
  const bulkAddMutation = useBulkAddCompanies();
  const { data: companies = [] } = useCompanies();
  const companyCount = companies.length;
  const remainingSlots = Math.max(0, FREE_PLAN_LIMITS.maxCompanies - companyCount);
  const atCompanyLimit = companyCount >= FREE_PLAN_LIMITS.maxCompanies;

  const redistributeWeights = useCallback((customCount: number, indScored: boolean, mScored: boolean) => {
    const total = 1 + (indScored ? 1 : 0) + (mScored ? 1 : 0) + customCount;
    const w = calcDefaultWeight(total);
    if (indScored) setIndustryWeight(w); else setIndustryWeight(0);
    if (mScored) setMrrWeight(w); else setMrrWeight(0);
    setLastLoginWeight(w);
    return w;
  }, []);

  const reset = () => {
    setMode("choose");
    setName("");
    setIndustry("");
    setIndustryScored(true);
    setMrrScored(true);
    setEmail("");
    setMrr("");
    setLastLogin("");
    const w = calcDefaultWeight(4);
    setIndustryWeight(w);
    setMrrWeight(w);
    setLastLoginWeight(w);
    setCustomFields([{ key: "", value: "", weight: w }]);
    setSelectedFile(null);
    setDragOver(false);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const addField = () => {
    const newFields = [...customFields, { key: "", value: "", weight: 0 }];
    const w = redistributeWeights(newFields.length, industryScored, mrrScored);
    setCustomFields(newFields.map((f) => ({ ...f, weight: w })));
  };

  const removeField = (idx: number) => {
    if (customFields.length <= 1) return;
    const newFields = customFields.filter((_, i) => i !== idx);
    const w = redistributeWeights(newFields.length, industryScored, mrrScored);
    setCustomFields(newFields.map((f) => ({ ...f, weight: w })));
  };

  const updateField = (idx: number, prop: "key" | "value" | "weight", val: string) => {
    const updated = [...customFields];
    if (prop === "weight") {
      updated[idx].weight = Number(val) || 0;
    } else {
      updated[idx][prop] = val;
    }
    setCustomFields(updated);
  };

  const handleManualSubmit = async () => {
    if (!name.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (atCompanyLimit) {
      toast.error(`Free plan limit reached (${FREE_PLAN_LIMITS.maxCompanies} companies). Remove a company to add a new one.`);
      return;
    }

    const snapshotData: Record<string, any> = {};
    if (mrr) snapshotData.mrr = Number(mrr) || 0;
    if (lastLogin) snapshotData.lastLogin = lastLogin;
    if (industry.trim()) snapshotData.industry = industry.trim();

    const validFields = customFields.filter((f) => f.key.trim() && f.value.trim());
    for (const f of validFields) {
      const numVal = Number(f.value);
      snapshotData[f.key.trim()] = isNaN(numVal) ? f.value.trim() : numVal;
    }

    try {
      await addCompanyMutation.mutateAsync({
        name: name.trim(),
        industry: industry.trim(),
        email: email.trim(),
        snapshotData,
        source: "manual",
      });
      toast.success(`${name.trim()} added successfully`);
      handleOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add company");
    }
  };

  // Fix 2 & 8: use shared validation in drag-and-drop
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const error = validateUploadFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setSelectedFile(file);
  }, []);

  // Fix 8: use shared validation in file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateUploadFile(file);
    if (error) {
      toast.error(error);
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
  };

  const handleProceedToMapping = () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }
    setMode("mapping");
  };

  const handleCSVMappingComplete = async (rows: Array<{
    name: string;
    industry: string;
    email: string;
    snapshotData: Record<string, any>;
  }>) => {
    if (atCompanyLimit) {
      toast.error(`Free plan limit reached (${FREE_PLAN_LIMITS.maxCompanies} companies). Remove companies before importing.`);
      return;
    }
    let toImport = rows;
    if (rows.length > remainingSlots) {
      toast.warning(
        `Only ${remainingSlots} of ${rows.length} rows will be imported (Free plan limit: ${FREE_PLAN_LIMITS.maxCompanies}).`
      );
      toImport = rows.slice(0, remainingSlots);
    }
    try {
      await bulkAddMutation.mutateAsync(
        toImport.map((r) => ({ ...r, source: "csv" }))
      );
      handleOpenChange(false);
    } catch (err) {
      toast.error("Import failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`bg-card border-border ${mode === "mapping" ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        {mode !== "mapping" && (
          <div className={`text-xs rounded-md border px-3 py-2 ${atCompanyLimit ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-secondary/40 text-muted-foreground"}`}>
            <span className="font-medium text-foreground">Free plan:</span> {companyCount} / {FREE_PLAN_LIMITS.maxCompanies} companies used
            {atCompanyLimit && " — limit reached"}
          </div>
        )}
        {mode === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Add Companies</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Choose how you'd like to add companies to track.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button
                onClick={() => setMode("manual")}
                className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-secondary/30 p-6 hover:border-primary/40 hover:bg-secondary/60 transition-all text-center"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Add Manually</p>
                  <p className="text-xs text-muted-foreground mt-1">Enter company details and custom attributes</p>
                </div>
              </button>
              <button
                onClick={() => setMode("upload")}
                className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-secondary/30 p-6 hover:border-primary/40 hover:bg-secondary/60 transition-all text-center"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Upload CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">Import a list of companies with custom fields</p>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === "manual" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => setMode("choose")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle className="text-xl">Add Company</DialogTitle>
              </div>
              <DialogDescription className="text-muted-foreground">
                Enter company details and any custom attributes for health scoring.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input id="company-name" placeholder="Acme Corp" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Main Email</Label>
                  <Input id="email" type="email" placeholder="contact@acme.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Scored Attributes</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span className="w-6" />
                  <span className="flex-1">Attribute</span>
                  <span className="flex-1">Value</span>
                  <span className="w-20 text-center">Weight</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = !industryScored;
                      setIndustryScored(next);
                      const w = redistributeWeights(customFields.length, next, mrrScored);
                      setCustomFields(customFields.map((f) => ({ ...f, weight: w })));
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={industryScored ? "Disable scoring" : "Enable scoring"}
                  >
                    {industryScored ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <Input value="Industry" disabled className={`flex-1 ${industryScored ? "opacity-60" : "opacity-30"}`} />
                  <Input placeholder="SaaS" value={industry} onChange={(e) => setIndustry(e.target.value)} className="flex-1" disabled={!industryScored} />
                  <Input type="number" min={0} value={industryWeight} onChange={(e) => setIndustryWeight(Number(e.target.value) || 0)} className="w-20 text-center" disabled={!industryScored} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = !mrrScored;
                      setMrrScored(next);
                      const w = redistributeWeights(customFields.length, industryScored, next);
                      setCustomFields(customFields.map((f) => ({ ...f, weight: w })));
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={mrrScored ? "Disable scoring" : "Enable scoring"}
                  >
                    {mrrScored ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <Input value="MRR ($)" disabled className={`flex-1 ${mrrScored ? "opacity-60" : "opacity-30"}`} />
                  <Input type="number" placeholder="12000" value={mrr} onChange={(e) => setMrr(e.target.value)} className="flex-1" />
                  <Input type="number" min={0} value={mrrWeight} onChange={(e) => setMrrWeight(Number(e.target.value) || 0)} className="w-20 text-center" disabled={!mrrScored} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 flex items-center justify-center">
                    <ToggleRight className="h-5 w-5 text-primary opacity-50" />
                  </span>
                  <Input value="Last Login" disabled className="flex-1 opacity-60" />
                  <Input type="date" value={lastLogin} onChange={(e) => setLastLogin(e.target.value)} className="flex-1" />
                  <Input type="number" min={0} value={lastLoginWeight} onChange={(e) => setLastLoginWeight(Number(e.target.value) || 0)} className="w-20 text-center" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Custom Attributes</Label>
                  <button onClick={addField} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add field
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span className="flex-1">Attribute</span>
                  <span className="flex-1">Value</span>
                  <span className="w-20 text-center">Weight</span>
                  <span className="w-6" />
                </div>
                {customFields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Attribute name"
                      value={field.key}
                      onChange={(e) => updateField(idx, "key", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value"
                      value={field.value}
                      onChange={(e) => updateField(idx, "value", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      placeholder="1"
                      value={field.weight}
                      onChange={(e) => updateField(idx, "weight", e.target.value)}
                      className="w-20 text-center"
                    />
                    <button
                      onClick={() => removeField(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      disabled={customFields.length <= 1}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Weights auto-distribute to 100 total. Adjust to control each attribute's influence on the health score.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="heroOutline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button
                variant="hero"
                size="sm"
                onClick={handleManualSubmit}
                disabled={addCompanyMutation.isPending}
              >
                {addCompanyMutation.isPending ? "Adding…" : "Add Company"}
              </Button>
            </div>
          </>
        )}

        {mode === "upload" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => setMode("choose")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle className="text-xl">Upload Company List</DialogTitle>
              </div>
              <DialogDescription className="text-muted-foreground">
                Upload a CSV file with your companies. You'll map columns to fields in the next step.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : selectedFile ? "border-primary/40 bg-primary/5" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {selectedFile ? (
                  <>
                    <FileSpreadsheet className="h-10 w-10 text-primary" />
                    <div className="text-center">
                      <p className="font-medium text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Choose different file
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div className="text-center">
                      <p className="font-medium text-sm">Drop your file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports CSV files (max 10 MB)</p>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <p className="text-xs font-medium mb-2">Expected format</p>
                <div className="font-mono text-xs text-muted-foreground space-y-0.5">
                  <p>company_name, industry, mrr, nps_score, ...</p>
                  <p>Acme Corp, SaaS, 12000, 72, ...</p>
                  <p>Globex Inc, Fintech, 8500, 45, ...</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  First row should be headers. You'll map columns to fields next.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="heroOutline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button variant="hero" size="sm" onClick={handleProceedToMapping} disabled={!selectedFile}>
                Next: Map Fields
              </Button>
            </div>
          </>
        )}

        {mode === "mapping" && selectedFile && (
          <CSVFieldMapper
            file={selectedFile}
            onComplete={handleCSVMappingComplete}
            onBack={() => setMode("upload")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCompanyDialog;
