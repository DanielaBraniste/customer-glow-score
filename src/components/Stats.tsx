import { motion } from "framer-motion";

const stats = [
  { value: "40%", label: "Reduction in churn" },
  { value: "3x", label: "Faster risk detection" },
  { value: "200+", label: "SaaS teams trust Rescuro" },
  { value: "10M+", label: "Accounts scored" },
];

const Stats = () => (
  <section className="py-20 px-6 border-y border-border">
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="grid grid-cols-2 md:grid-cols-4 gap-8"
      >
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-gradient mb-1">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Stats;
