import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PlanTier } from "@/lib/planLimits";

/**
 * Reads the authenticated user's plan from their profile so plan-gated
 * limits reflect the actual tier (including admin-assigned changes).
 */
export const usePlan = () => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanTier>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setPlan((data?.plan as PlanTier) || "free");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return { plan, loading };
};
