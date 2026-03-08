import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import intercomLogo from "@/assets/connectors/intercom.png";
import hubspotLogo from "@/assets/connectors/hubspot.png";
import salesforceLogo from "@/assets/connectors/salesforce.png";
import slackLogo from "@/assets/connectors/slack.png";
import zendeskLogo from "@/assets/connectors/zendesk.png";
import pipedriveLogo from "@/assets/connectors/pipedrive.png";
import stripeLogo from "@/assets/connectors/stripe.png";
import segmentLogo from "@/assets/connectors/segment.png";

const connectors = [
  { id: "intercom", name: "Intercom", logo: intercomLogo, description: "Import conversations, contacts, and engagement data", category: "Support" },
  { id: "hubspot", name: "HubSpot", logo: hubspotLogo, description: "Sync deals, contacts, and CRM activity", category: "CRM" },
  { id: "salesforce", name: "Salesforce", logo: salesforceLogo, description: "Pull accounts, opportunities, and activity logs", category: "CRM" },
  { id: "slack", name: "Slack", logo: slackLogo, description: "Monitor customer channel activity and sentiment", category: "Communication" },
  { id: "zendesk", name: "Zendesk", logo: zendeskLogo, description: "Import tickets, satisfaction scores, and response times", category: "Support" },
  { id: "pipedrive", name: "Pipedrive", logo: pipedriveLogo, description: "Sync deals, contacts, and pipeline data", category: "CRM" },
  { id: "stripe", name: "Stripe", logo: stripeLogo, description: "Track MRR, churn, payment failures, and billing data", category: "Billing" },
  { id: "segment", name: "Segment", logo: segmentLogo, description: "Unified customer data from all your sources", category: "Data" },
];

const categories = [...new Set(connectors.map((c) => c.category))];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const Connectors = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleConnect = (connectorName: string) => {
    toast.info(`${connectorName} integration coming soon! We'll notify you when it's available.`);
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
            Connect your tools to automatically import customer data and keep health scores up to date in real time.
          </p>
        </div>

        {categories.map((category) => (
          <div key={category} className="mb-10">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">{category}</h2>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {connectors
                .filter((c) => c.category === category)
                .map((connector) => (
                  <motion.div
                    key={connector.id}
                    variants={item}
                    className="group rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="h-12 w-12 rounded-lg bg-secondary/60 flex items-center justify-center p-2 shrink-0">
                        <img src={connector.logo} alt={connector.name} className="h-8 w-8 object-contain" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{connector.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{connector.description}</p>
                      </div>
                    </div>
                    <Button
                      variant="heroOutline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleConnect(connector.name)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Connect
                    </Button>
                  </motion.div>
                ))}
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
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).elements.namedItem("connector-request") as HTMLInputElement;
              if (input.value.trim()) {
                toast.success(`Thanks! We've noted your request for "${input.value.trim()}".`);
                input.value = "";
              }
            }}
            className="flex items-center gap-2 max-w-sm mx-auto"
          >
            <Input name="connector-request" placeholder="e.g. Freshdesk, Mixpanel..." className="text-sm" />
            <Button variant="hero" size="sm" type="submit">Request</Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Connectors;
