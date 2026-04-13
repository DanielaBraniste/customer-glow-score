import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Send } from "lucide-react";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("contact_submissions")
      .insert({ name: name.trim(), email: email.trim(), message: message.trim() });

    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-6">
        <div className="max-w-lg mx-auto">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Send className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Message sent!</h1>
              <p className="text-muted-foreground">Thanks for reaching out. We'll get back to you shortly.</p>
              <Button variant="ghost" onClick={() => navigate("/")}>Back to home</Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Get in Touch</h1>
              <p className="text-muted-foreground mb-8">Have a question or want to learn more? Drop us a message.</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" required maxLength={2000} rows={5} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Sending…" : "Send Message"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
