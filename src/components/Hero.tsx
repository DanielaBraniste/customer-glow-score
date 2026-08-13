import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const Hero = () => (
  <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
    <div className="absolute inset-0 hero-gradient" />
    <div className="absolute inset-0 grid-pattern opacity-30" />
    
    <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8 mt-8">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          <span className="text-sm font-medium text-primary">Now in Public Beta</span>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Know your customers
          <br />
          <span className="text-gradient">before they churn</span>
        </h1>

        <p className="text-lg md:text-xl text-foreground/80 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
          Rescuro gives SaaS teams a single health score per account — powered by usage, support, billing &amp; engagement data. No spreadsheets, no guesswork.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild variant="hero" size="lg" className="h-12 px-8">
            <Link to="/trial">Start Free Trial <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="heroOutline" size="lg" className="h-12 px-8">
            <a href="https://calendar.google.com/appointments/schedules/AcZssZ2tBT5NYypWaK5wf9lE_qTonRFPjcazbqADCR4NlmVyhaa6zn22cz6SHTRO8GP5XQPT-09cWxF5" target="_blank" rel="noopener noreferrer">
              Book a Demo
            </a>
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="mt-20 rounded-xl border border-border bg-card/60 backdrop-blur-sm p-1 glow-box"
      >
        <div className="rounded-lg bg-card p-6 md:p-8">
          <div className="grid grid-cols-3 gap-4 md:gap-8">
            {[
              { score: "92", label: "Acme Corp", status: "Healthy" },
              { score: "64", label: "Globex Inc", status: "At Risk" },
              { score: "31", label: "Initech", status: "Critical" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className={`text-3xl md:text-5xl font-bold font-mono mb-1 ${
                  Number(item.score) >= 80 ? "text-primary" : Number(item.score) >= 50 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {item.score}
                </div>
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.status}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

export default Hero;
