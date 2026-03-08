import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const CTA = () => (
  <section className="py-28 px-6 relative overflow-hidden">
    <div className="absolute inset-0 hero-gradient opacity-60" />
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative z-10 max-w-3xl mx-auto text-center"
    >
      <h2 className="text-3xl md:text-5xl font-bold mb-6">
        Stop guessing.<br />
        <span className="text-gradient">Start scoring.</span>
      </h2>
      <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
        Be among the first SaaS teams to predict churn before it happens — join the public beta today.
      </p>
      <Button asChild variant="hero" size="lg" className="h-12 px-8">
        <Link to="/trial">Get Started Free <ArrowRight className="ml-1 h-4 w-4" /></Link>
      </Button>
    </motion.div>
  </section>
);

export default CTA;
