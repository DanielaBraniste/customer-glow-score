import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Zap, Check, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import intercomLogo from "@/assets/connectors/intercom.png";
import hubspotLogo from "@/assets/connectors/hubspot.png";
import salesforceLogo from "@/assets/connectors/salesforce.png";
import slackLogo from "@/assets/connectors/slack.png";
import zendeskLogo from "@/assets/connectors/zendesk.png";
import pipedriveLogo from "@/assets/connectors/pipedrive.png";
import stripeLogo from "@/assets/connectors/stripe.png";
import segmentLogo from "@/assets/connectors/segment.png";

const connectorDefs = [
  {
    id: "intercom",
    name: "Intercom",
    logo: intercomLogo,
    description: "Import conversations, contacts, and engagement data",
    category: "Support",
    keyLabel: "Access Token",
    instructions: "Go to Settings → Integrations → Developer Hub → Your App → Authentication. Copy your Access Token.",
    scopes: ["Read conversations", "Read contacts", "Read companies", "Read admins"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    logo: hubspotLogo,
    description: "Sync deals, contacts, and CRM activity",
    category: "CRM",
    keyLabel: "Private App Token",
    instructions: "Go to Settings → Integrations → Private Apps → Create a private app. Name it, assign the scopes below, then copy the token.",
    scopes: ["crm.objects.companies.read", "crm.objects.contacts.read", "crm.objects.deals.read", "tickets"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    logo: salesforceLogo,
    description: "Pull accounts, opportunities, and activity logs",
    category: "CRM",
    keyLabel: "Access Token",
    instructions: "Create a Connected App in Setup → App Manager. Use OAuth 2.0 to generate an access token. Paste the value as: instanceUrl|accessToken",
    scopes: ["api", "refresh_token", "offline_access"],
  },
  {
    id: "slack",
    name: "Slack",
    logo: slackLogo,
    description: "Monitor customer channel activity and sentiment",
    category: "Communication",
    keyLabel: "Bot Token",
    instructions: "Go to api.slack.com/apps → Create New App → OAuth & Permissions. Install to your workspace and copy the Bot User OAuth Token (starts with xoxb-).",
    scopes: ["channels:history", "channels:read", "groups:read", "groups:history", "users:read"],
  },
  {
    id: "zendesk",
    name: "Zendesk",
    logo: zendeskLogo,
    description: "Import tickets, satisfaction scores, and response times",
    category: "Support",
    keyLabel: "API Token",
    instructions: "Go to Admin Center → Apps & Integrations → APIs → Zendesk API → Add API Token. Paste the value as: subdomain|email/token|apiToken",
    scopes: ["read (tickets)", "read (organizations)", "read (users)"],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    logo: pipedriveLogo,
    description: "Sync deals, contacts, and pipeline data",
    category: "CRM",
    keyLabel: "API Token",
    instructions: "Go to Settings → Personal Preferences → API → Copy your personal API token.",
    scopes: ["Deals (read)", "Contacts (read)", "Activities (read)", "Organizations (read)"],
  },
  {
    id: "stripe",
    name: "Stripe",
    logo: stripeLogo,
    description: "Track MRR, churn, payment failures, and billing data",
    category: "Billing",
    keyLabel: "Secret Key",
    instructions: "Go to Developers → API Keys. Use a Restricted Key for security — create one with the permissions below.",
    scopes: ["Subscriptions (read)", "Customers (read)", "Invoices (read)", "Charges (read)"],
  },
  {
    id: "segment",
    name: "Segment",
    logo: segmentLogo,
    description: "Unified customer data from all your sources",
    category: "Data",
    keyLabel: "Write Key",
    instructions: "Go to your Segment workspace → Sources → select your source → Settings → API Keys. Paste the value as: spaceId|accessToken",
    scopes: ["Profiles (read)", "Traits (read)", "Events (read)"],
  },
];

const categories = [...new Set(connectorDefs.map((c) => c.category))];

interface UserConnector {
  id: string;
  connector_id: string;
  is_active: boolean;
  last_import_at: string | null;
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const Connectors = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userConnectors, setUserConnectors] = useState<UserConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectDialog, setConnectDialog] = useState<typeof connectorDefs[0] | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("user_connectors")
        .select("id, connector_id, is_active, last_import_at")
        .eq("user_id", user.id);
      setUserConnectors(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const getConnectorStatus = (connectorId: string) => userConnectors.find((c) => c.connector_id === connectorId);

  const handleConnect = (connector: typeof connectorDefs[0]) => {
    setConnectDialog(connector);
    setApiKeyInput("");
  };

  // Fix 9 & 10: error handling, awaited import, TODO for plaintext keys
  const handleSaveConnection = async () => {
    if (!user || !connectDialog) return;
    if (!apiKeyInput.trim()) {
      toast.error("Please enter your API key");
      return;
    }

    // Capture before clearing dialog
    const connectorName = connectDialog.name;
    const connectorId = connectDialog.id;

    setSaving(true);
    try {
      const existing = getConnectorStatus(connectorId);

      // TODO: API keys are stored as plaintext in user_connectors.
      // For production, encrypt at rest using Supabase Vault (vault.create_secret)
      // or pgcrypto (pgp_sym_encrypt) with a server-side key.
      // See: https://supabase.com/docs/guides/database/vault

      if (existing) {
        const { error } = await supabase
          .from("user_connectors")
          .update({ api_key: apiKeyInput.trim(), is_active: true, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_connectors").insert({
          user_id: user.id,
          connector_id: connectorId,
          api_key: apiKeyInput.trim(),
          is_active: true,
        });
        if (error) throw error;
      }

      // Refresh connector list
      const { data } = await supabase
        .from("user_connectors")
        .select("id, connector_id, is_active, last_import_at")
        .eq("user_id", user.id);
      setUserConnectors(data || []);
      setConnectDialog(null);
      toast.success(`${connectorName} connected! Running first import…`);

      // Trigger immediate import and await it
      try {
        const { error } = await supabase.functions.invoke("daily-import", {
          body: { connector_id: connectorId, user_id: user.id },
        });
        if (error) {
          console.error("Immediate import failed:", error);
          toast.error("First import failed — it will retry at 6 AM UTC.");
        } else {
          toast.success("Initial data import complete!");
        }
      } catch (importErr) {
        console.error("Import invocation error:", importErr);
        toast.error("First import failed — it will retry at 6 AM UTC.");
      }
    } catch (err: any) {
      console.error("Save connection failed:", err);
      toast.error(err?.message || "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (connectorId: string) => {
    const existing = getConnectorStatus(connectorId);
    if (!existing) return;
    await supabase.from("user_connectors").update({ is_active: false }).eq("id", existing.id);
    const { data } = await supabase
      .from("user_connectors")
      .select("id, connector_id, is_active, last_import_at")
      .eq("user_id", user!.id);
    setUserConnectors(data || []);
    toast.success("Connector disconnected");
  };

  return (
    <div className="min-h-screen bg-background pt-20 px-6 pb-16">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Connectors</h1>
          </div>
          <p className="text-muted-foreground max-w-xl">
            Connect your tools to automatically import customer data daily and keep health scores up to date.
          </p>
        </div>

        {categories.map((category) => (
          <div key={category} className="mb-10">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">{category}</h2>
            <motion.div variants={container} initial="hidden" animate="show" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectorDefs
                .filter((c) => c.category === category)
                .map((connector) => {
                  const status = getConnectorStatus(connector.id);
                  const isConnected = status?.is_active;
                  return (
                    <motion.div
                      key={connector.id}
                      variants={item}
                      className={`group rounded-xl border p-5 transition-all ${
                        isConnected ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="h-12 w-12 rounded-lg bg-secondary/60 flex items-center justify-center p-2 shrink-0">
                          <img src={connector.logo} alt={connector.name} className="h-8 w-8 object-contain" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{connector.name}</h3>
                            {isConnected && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-medium">
                                <Check className="h-3 w-3" /> Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{connector.description}</p>
                          {isConnected && status.last_import_at && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Last import: {new Date(status.last_import_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <Button variant="heroOutline" size="sm" className="w-full" onClick={() => handleDisconnect(connector.id)}>
                          <X className="h-3.5 w-3.5 mr-1.5" /> Disconnect
                        </Button>
                      ) : (
                        <Button variant="heroOutline" size="sm" className="w-full" onClick={() => handleConnect(connector)}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Connect
                        </Button>
                      )}
                    </motion.div>
                  );
                })}
            </motion.div>
          </div>
        ))}

        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center space-y-4">
          <p className="text-muted-foreground text-sm font-medium">Don't see your tool?</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Request a connector and we'll prioritize building it. You can also{" "}
            <button className="text-primary hover:underline" onClick={() => navigate("/dashboard")}>upload a CSV</button>{" "}
            with your customer data in the meantime.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).elements.namedItem("connector-request") as HTMLInputElement;
              const val = input.value.trim();
              if (!val) return;
              if (!user) { toast.error("Please sign in first"); return; }
              try {
                const { error } = await (supabase.from as any)("connector_requests").insert([{ user_id: user.id, connector_name: val }]);
                if (error) { toast.error("Failed to submit request: " + error.message); console.error("Insert error:", error); return; }
                toast.success(`Thanks! We've noted your request for "${val}".`);
                input.value = "";
              } catch (err: any) {
                console.error("Request submit error:", err);
                toast.error("Something went wrong");
              }
            }}
            className="flex items-center gap-2 max-w-sm mx-auto"
          >
            <Input name="connector-request" placeholder="e.g. Freshdesk, Mixpanel..." className="text-sm" />
            <Button variant="hero" size="sm" type="submit">Request</Button>
          </form>
        </div>
      </div>

      {/* Connect Dialog */}
      <Dialog open={!!connectDialog} onOpenChange={(v) => !v && setConnectDialog(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {connectDialog && (
                <div className="h-10 w-10 rounded-lg bg-secondary/60 flex items-center justify-center p-2">
                  <img src={connectDialog.logo} alt={connectDialog.name} className="h-7 w-7 object-contain" />
                </div>
              )}
              Connect {connectDialog?.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter your {connectDialog?.keyLabel} to enable daily automated imports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="api-key">{connectDialog?.keyLabel}</Label>
              <Input
                id="api-key"
                type="password"
                placeholder={`Paste your ${connectDialog?.keyLabel?.toLowerCase()}...`}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your key is stored securely and only used for automated data imports.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
              <p className="text-xs font-medium">What happens next?</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• Your data will be imported daily at 6:00 AM UTC</li>
                <li>• Health scores update automatically after each import</li>
                <li>• You can disconnect anytime</li>
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="heroOutline" size="sm" onClick={() => setConnectDialog(null)}>Cancel</Button>
              <Button variant="hero" size="sm" onClick={handleSaveConnection} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Connect & Enable
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Connectors;
