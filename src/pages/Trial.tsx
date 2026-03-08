import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const perks = [
  "Track up to 30 companies free",
  "3 integrations included",
  "Weekly health score updates",
  "No credit card required",
  "Cancel anytime",
];

const Trial = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) return;

    setLoading(true);
    try {
      await signUp(email, password);
      toast({
        title: "Check your email",
        description: "We've sent you a confirmation link to verify your account.",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Something went wrong",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — Value prop */}
      <div className="hidden lg:flex flex-col justify-center w-1/2 px-16 relative overflow-hidden">
        <div className="absolute inset-0 hero-gradient opacity-60" />
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="relative z-10 max-w-md">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </button>

          <div className="flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">D</span>
            </div>
            <span className="font-bold text-xl">Desi</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight mb-4">
            Start your <span className="text-gradient">free trial</span>
          </h1>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Get instant visibility into customer health. Set up in minutes, no engineering required.
          </p>

          <ul className="space-y-4">
            {perks.map((perk, i) => (
              <motion.li
                key={perk}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-muted-foreground"
              >
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
                {perk}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right — Signup form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <button
            onClick={() => navigate("/")}
            className="flex lg:hidden items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </button>

          <Card className="border-border">
            <CardHeader className="text-center">
              <div className="flex lg:hidden items-center justify-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">D</span>
                </div>
                <span className="font-bold text-lg">Desi</span>
              </div>
              <CardTitle className="text-2xl">Create your account</CardTitle>
              <CardDescription>Start your 14-day free trial — no credit card needed</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company name</Label>
                  <Input
                    id="company"
                    placeholder="Acme Corp"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="jane@acme.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  variant="hero"
                  className="w-full h-11 mt-2"
                  disabled={loading}
                >
                  {loading ? "Creating account…" : "Start Free Trial"}
                  {!loading && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground mt-6">
                Already have an account?{" "}
                <button
                  onClick={() => navigate("/auth")}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Trial;
