import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserCog, LogOut } from "lucide-react";

export const IMPERSONATION_KEY = "impersonating_email";

const ImpersonationBanner = () => {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setEmail(sessionStorage.getItem(IMPERSONATION_KEY));
    const onChange = () => setEmail(sessionStorage.getItem(IMPERSONATION_KEY));
    window.addEventListener("impersonation-change", onChange);
    return () => window.removeEventListener("impersonation-change", onChange);
  }, []);

  if (!email) return null;

  const exit = async () => {
    sessionStorage.removeItem(IMPERSONATION_KEY);
    await supabase.auth.signOut();
    window.location.href = "/admin-9x7k";
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-1.5 text-sm font-medium">
        <span className="flex items-center gap-2 truncate">
          <UserCog className="h-4 w-4 shrink-0" />
          Impersonating <strong className="truncate">{email}</strong>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 hover:bg-black/10 text-black"
          onClick={exit}
        >
          <LogOut className="h-3.5 w-3.5 mr-1.5" /> Exit
        </Button>
      </div>
    </div>
  );
};

export default ImpersonationBanner;
