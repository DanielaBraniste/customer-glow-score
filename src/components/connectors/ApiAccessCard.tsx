import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Code2, Copy, Loader2, Plus, Trash2, KeyRound } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const ENDPOINT = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ingest`;

const sha256Hex = async (input: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const generateKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "rsc_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const ApiAccessCard = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Production");
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const loadKeys = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setKeys(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return toast.error("Give the key a name");
    setCreating(true);
    const key = generateKey();
    const { error } = await supabase.from("api_keys").insert({
      user_id: user!.id,
      name: newKeyName.trim(),
      key_prefix: key.slice(0, 12),
      key_hash: await sha256Hex(key),
    });
    setCreating(false);
    if (error) return toast.error("Could not create key: " + error.message);
    setCreateOpen(false);
    setRevealed(key);
    setNewKeyName("Production");
    loadKeys();
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) return toast.error("Could not revoke key");
    toast.success("API key revoked");
    loadKeys();
  };

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const curlExample = `curl -X POST ${ENDPOINT} \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "company": "Acme Inc",
        "email": "ops@acme.com",
        "industry": "SaaS",
        "data": {
          "mrr": 4200,
          "nps": 45,
          "lastLogin": "2026-09-02",
          "supportTickets": 3,
          "contractEnd": "2027-01-31",
          "usageScore": 78
        }
      }
    ]
  }'`;

  return (
    <div className="mb-12 rounded-xl border border-border bg-secondary/30 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Send data via API</h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              No third-party tool? Push usage data straight from your own app with a simple POST request.
              Companies are created automatically and health scores are calculated on the spot.
            </p>
          </div>
        </div>
        <Button variant="hero" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New API key
        </Button>
      </div>

      {/* Keys list */}
      <div className="mb-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet — create one to start sending data.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}••••••••</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Docs */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Endpoint</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background/70 border border-border rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">
              POST {ENDPOINT}
            </code>
            <Button variant="ghost" size="sm" onClick={() => copy(ENDPOINT, "Endpoint copied")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Example request</p>
            <Button variant="ghost" size="sm" onClick={() => copy(curlExample, "Example copied")}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          </div>
          <pre className="text-xs font-mono bg-background/70 border border-border rounded-md p-3 overflow-x-auto">
{curlExample}
          </pre>
        </div>

        <ul className="text-xs text-muted-foreground space-y-1 pt-1">
          <li>• Authenticate with the <span className="font-mono">x-api-key</span> header.</li>
          <li>• Send one record or up to 200 per request in the <span className="font-mono">records</span> array.</li>
          <li>• <span className="font-mono">data</span> accepts any metric keys — the six scored fields plus your own custom ones.</li>
          <li>• Optional <span className="font-mono">snapshot_date</span> (YYYY-MM-DD) lets you backfill history; one snapshot per company per day.</li>
          <li>• Companies are matched by name (case-insensitive) and created if new.</li>
        </ul>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>The key is shown only once — store it somewhere safe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyname">Key name</Label>
              <Input id="keyname" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} maxLength={60} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="heroOutline" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="hero" size="sm" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reveal dialog */}
      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>Copy it now — you won't be able to see it again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-secondary/60 border border-border rounded-md px-3 py-2 break-all">
                {revealed}
              </code>
              <Button variant="ghost" size="sm" onClick={() => copy(revealed!, "API key copied")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="hero" size="sm" onClick={() => setRevealed(null)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiAccessCard;
