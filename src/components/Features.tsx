import { motion } from "framer-motion";
import { Activity, Zap, BarChart3, RefreshCw, Bell } from "lucide-react";

const features = [
  { icon: Activity, title: "Real-Time Scoring", desc: "Health scores update as customer behavior changes — not on a weekly batch." },
  { icon: Zap, title: "5-Minute Setup", desc: "Connect your tools and get scores instantly. No data engineering required." },
  { icon: BarChart3, title: "Custom Weights", desc: "Tune what matters. Weight usage, NPS, support tickets, and billing signals your way." },
  { icon: RefreshCw, title: "Native Integrations", desc: "Plug into Stripe, Intercom, HubSpot, Segment, and 40+ other tools — or simply upload a CSV with your customer list." },
  { icon: Bell, title: "Smart Alerts", desc: "Get notified in Slack or email when an account drops below your threshold." },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const Features = () => (
  <section className="py-28 px-6">
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to predict churn</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          One platform to score, monitor, and act on customer health across your entire book of business.
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <f.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Features;
