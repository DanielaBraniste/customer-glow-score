import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const articles = [
  {
    slug: "customer-success-kpis-saas-2026",
    title: "Customer Success KPIs Every SaaS Company Should Track in 2026",
    excerpt:
      "The era of 'growth at all costs' is over. In 2026, the SaaS companies that win are the ones obsessing over the customers they already have — not just the ones they're chasing. Here are the KPIs that separate thriving CS teams from the rest.",
    date: "April 13, 2026",
    readTime: "16 min read",
  },
  {
    slug: "customer-health-score-vs-nps",
    title: "Customer Health Score vs. NPS: What's the Difference and When to Use Each",
    excerpt:
      "A customer gives you a 9 on their NPS survey — then churns two months later. Sound familiar? Here's why NPS alone can't protect your revenue, and how pairing it with a customer health score gives your CS team the full picture.",
    date: "April 13, 2026",
    readTime: "14 min read",
  },
  {
    slug: "what-is-customer-health-score",
    title: "What Is a Customer Health Score? A Complete Guide for SaaS Teams",
    excerpt:
      "Your CRM says the account is 'active.' Your CSM says the relationship is 'strong.' Then the customer churns — and everyone acts surprised. A customer health score fixes this by making the invisible visible.",
    date: "April 13, 2026",
    readTime: "12 min read",
  },
];

const Blog = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Navbar />
    <main className="pt-28 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Blog</h1>
        <p className="text-lg text-muted-foreground mb-12">
          Insights on customer success, health scoring, and SaaS retention.
        </p>

        <div className="space-y-10">
          {articles.map((a) => (
            <Link
              key={a.slug}
              to={`/blog/${a.slug}`}
              className="block group rounded-xl border border-border p-6 hover:border-primary/40 transition-colors"
            >
              <p className="text-sm text-muted-foreground mb-2">
                {a.date} · {a.readTime}
              </p>
              <h2 className="text-xl font-semibold group-hover:text-primary transition-colors mb-2">
                {a.title}
              </h2>
              <p className="text-muted-foreground leading-relaxed">{a.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default Blog;
