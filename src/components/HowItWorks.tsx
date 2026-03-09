import { motion } from "framer-motion";

const steps = [
  { num: "01", title: "Connect your stack", desc: "Link your CRM, billing, support, and product analytics tools in minutes." },
  { num: "02", title: "We crunch the data", desc: "Rescuro normalizes signals and calculates a composite health score per account." },
  { num: "03", title: "Act with confidence", desc: "Prioritize outreach, automate alerts, and prevent churn before it happens." },
];

const HowItWorks = () => (
  <section className="py-28 px-6 bg-card/50">
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
        <p className="text-muted-foreground text-lg">Three steps. Five minutes. Full visibility.</p>
      </motion.div>

      <div className="space-y-12">
        {steps.map((s, i) => (
          <motion.div
            key={s.num}
            initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="flex items-start gap-6"
          >
            <span className="text-4xl font-bold font-mono text-primary/70 shrink-0">{s.num}</span>
            <div>
              <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
