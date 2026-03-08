import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "Get started with the basics",
    features: [
      "Up to 30 companies",
      "3 connections",
      "Weekly updates",
      "Basic health scores",
      "Email support",
    ],
    cta: "Get Started Free",
    variant: "heroOutline" as const,
    popular: false,
  },
  {
    name: "Starter",
    price: "$37",
    period: "/mo",
    description: "For growing SaaS teams",
    features: [
      "Up to 100 companies",
      "7 connectors",
      "Daily updates",
      "Advanced health scores",
      "Priority email support",
    ],
    cta: "Start Free Trial",
    variant: "heroOutline" as const,
    popular: false,
  },
  {
    name: "Medium",
    price: "$150",
    period: "/mo",
    description: "Scale your customer success",
    features: [
      "Up to 250 companies",
      "10 connectors",
      "Daily updates",
      "Custom dashboards",
      "Slack & email alerts",
      "Dedicated support",
    ],
    cta: "Start Free Trial",
    variant: "hero" as const,
    popular: true,
  },
  {
    name: "Premium",
    price: "Custom",
    period: "",
    description: "Enterprise-grade solution",
    features: [
      "Unlimited companies",
      "Custom integrations",
      "Real-time updates",
      "Custom dashboards & reports",
      "Dedicated CSM",
      "SLA & onboarding",
    ],
    cta: "Book a Demo",
    variant: "heroOutline" as const,
    popular: false,
    isEnterprise: true,
  },
];

const Pricing = () => (
  <section id="pricing" className="py-28 px-6 relative">
    <div className="absolute inset-0 hero-gradient opacity-30" />
    <div className="relative z-10 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl md:text-5xl font-bold mb-4">
          Simple, transparent <span className="text-gradient">pricing</span>
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Start free. Upgrade as you grow. No hidden fees.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="flex"
          >
            <Card
              className={`flex flex-col w-full relative ${
                plan.popular
                  ? "border-primary/50 glow-box"
                  : "border-border"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan.isEnterprise ? (
                  <Button variant={plan.variant} className="w-full" asChild>
                    <a
                      href="https://calendar.google.com/appointments/schedules/AcZssZ2tBT5NYypWaK5wf9lE_qTonRFPjcazbqADCR4NlmVyhaa6zn22cz6SHTRO8GP5XQPT-09cWxF5"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {plan.cta}
                    </a>
                  </Button>
                ) : (
                  <Button variant={plan.variant} className="w-full">
                    {plan.cta}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default Pricing;
