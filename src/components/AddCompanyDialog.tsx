import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Building2, Plus, X, FileSpreadsheet, ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

interface CustomField {
  key: string;
  value: string;
  weight: number;
}

interface AddCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCompany: (company: { name: string; industry: string; fields: CustomField[] }) => void;
  onUploadCSV: (file: File) => void;
}

type Mode = "choose" | "manual" | "upload";

const calcDefaultWeight = (scoredCount: number) =>
  Math.round((100 / Math.max(scoredCount, 1)) * 10) / 10;

const AddCompanyDialog = ({ open, onOpenChange, onAddCompany, onUploadCSV }: AddCompanyDialogProps) => {
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryScored, setIndustryScored] = useState(true);
  const [industryWeight, setIndustryWeight] = useState(0);
  const [email, setEmail] = useState("");
  const [mrr, setMrr] = useState("");
  const [mrrScored, setMrrScored] = useState(true);
  const [mrrWeight, setMrrWeight] = useState(0);
  const [lastLogin, setLastLogin] = useState("");
  const [lastLoginWeight, setLastLoginWeight] = useState(0);
  const [customFields, setCustomFields] = useState<CustomField[]>([{ key: "", value: "", weight: 0 }]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Count scored fixed attributes
  const scoredFixedCount = 1 + (industryScored ? 1 : 0) + (mrrScored ? 1 : 0); // last_login always scored

  const redistributeWeights = useCallback((customCount: number, indScored: boolean, mScored: boolean) => {
    const total = 1 + (indScored ? 1 : 0) + (mScored ? 1 : 0) + customCount; // 1 = last_login
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
    setEmail("");
    setMrr("");
    setLastLogin("");
    const w = calcDefaultWeight(1);
    setIndustryWeight(w);
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
    const w = redistributeWeights(newFields.length);
    setCustomFields(newFields.map((f) => ({ ...f, weight: w })));
  };

  const removeField = (idx: number) => {
    if (customFields.length <= 1) return;
    const newFields = customFields.filter((_, i) => i !== idx);
    const w = redistributeWeights(newFields.length);
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

  const handleManualSubmit = () => {
    if (!name.trim()) {
      toast.error("Company name is required");
      return;
    }
    const validFields = customFields.filter((f) => f.key.trim() && f.value.trim());
    onAddCompany({ name: name.trim(), industry: industry.trim(), fields: validFields });
    toast.success(`${name.trim()} added successfully`);
    handleOpenChange(false);
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv") || file.name.endsWith(".xlsx"))) {
      setSelectedFile(file);
    } else {
      toast.error("Please upload a CSV or XLSX file");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUploadSubmit = () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }
    onUploadCSV(selectedFile);
    toast.success(`Uploaded ${selectedFile.name} — processing companies...`);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
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
              {/* Default fields */}
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
              <div className="space-y-2">
                <Label htmlFor="mrr">MRR ($)</Label>
                <Input id="mrr" type="number" placeholder="12000" value={mrr} onChange={(e) => setMrr(e.target.value)} />
              </div>

              {/* Scored default attributes with weight */}
              <div className="space-y-3">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Scored Attributes</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span className="flex-1">Attribute</span>
                  <span className="flex-1">Value</span>
                  <span className="w-20 text-center">Weight</span>
                  <span className="w-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Input value="Industry" disabled className="flex-1 opacity-60" />
                  <Input placeholder="SaaS" value={industry} onChange={(e) => setIndustry(e.target.value)} className="flex-1" />
                  <Input type="number" min={0} value={industryWeight} onChange={(e) => setIndustryWeight(Number(e.target.value) || 0)} className="w-20 text-center" />
                  <span className="w-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Input value="Last Login" disabled className="flex-1 opacity-60" />
                  <Input type="date" value={lastLogin} onChange={(e) => setLastLogin(e.target.value)} className="flex-1" />
                  <Input type="number" min={0} value={lastLoginWeight} onChange={(e) => setLastLoginWeight(Number(e.target.value) || 0)} className="w-20 text-center" />
                  <span className="w-6" />
                </div>
              </div>

              {/* Custom attributes with weight */}
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
              <Button variant="hero" size="sm" onClick={handleManualSubmit}>Add Company</Button>
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
                Upload a CSV or XLSX file with your companies. Include any custom columns for health scoring attributes.
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
                      <p className="text-xs text-muted-foreground mt-1">Supports CSV and XLSX files</p>
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
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
                  First row should be headers. Any extra columns become custom attributes.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="heroOutline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button variant="hero" size="sm" onClick={handleUploadSubmit} disabled={!selectedFile}>Upload & Import</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCompanyDialog;
