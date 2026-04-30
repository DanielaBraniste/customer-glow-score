import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const DEMO_BOOKING_URL =
  "https://calendar.google.com/appointments/schedules/AcZssZ2tBT5NYypWaK5wf9lE_qTonRFPjcazbqADCR4NlmVyhaa6zn22cz6SHTRO8GP5XQPT-09cWxF5";

export type UpgradeTriggerReason =
  | "company_limit_manual"
  | "company_limit_csv"
  | "connector_limit";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpgradeTriggerReason;
  attemptedCount?: number;
  currentCount?: number;
  planLimit?: number;
}

const reasonCopy: Record<UpgradeTriggerReason, { title: string; description: string }> = {
  company_limit_manual: {
    title: "You've reached the Free plan limit",
    description: "The Free plan includes up to 30 companies. Upgrade to track more — let's hop on a quick call to find the right plan for you.",
  },
  company_limit_csv: {
    title: "Your import exceeds the Free plan limit",
    description: "The Free plan includes up to 30 companies. We can unlock higher limits — book a call and we'll get you set up.",
  },
  connector_limit: {
    title: "Free plan allows 1 connector",
    description: "Want to connect more tools at once? Let's chat about a plan that fits your stack.",
  },
};

const UpgradeDialog = ({
  open,
  onOpenChange,
  reason,
  attemptedCount,
  currentCount,
  planLimit,
}: UpgradeDialogProps) => {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  // Log the upgrade trigger as soon as the dialog opens.
  useEffect(() => {
    if (!open) {
      setRequestId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("upgrade_requests")
        .insert({
          user_id: user?.id ?? null,
          email: user?.email ?? null,
          trigger_reason: reason,
          attempted_count: attemptedCount ?? null,
          current_count: currentCount ?? null,
          plan_limit: planLimit ?? null,
        })
        .select("id")
        .maybeSingle();
      if (!cancelled && !error && data) setRequestId(data.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reason, user, attemptedCount, currentCount, planLimit]);

  const copy = reasonCopy[reason];

  const handleScheduleCall = async () => {
    setSubmitting(true);
    try {
      if (requestId) {
        await supabase
          .from("upgrade_requests")
          .update({ scheduled_call: true })
          .eq("id", requestId);
      } else {
        // Fallback: insert a fresh row marked as scheduled.
        await supabase.from("upgrade_requests").insert({
          user_id: user?.id ?? null,
          email: user?.email ?? null,
          trigger_reason: reason,
          attempted_count: attemptedCount ?? null,
          current_count: currentCount ?? null,
          plan_limit: planLimit ?? null,
          scheduled_call: true,
        });
      }
      window.open(DEMO_BOOKING_URL, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't open the booking page. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-xl">{copy.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground pt-1">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {(currentCount !== undefined || attemptedCount !== undefined) && (
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {planLimit !== undefined && (
              <div>Current usage: <span className="text-foreground font-medium">{currentCount ?? 0} / {planLimit}</span></div>
            )}
            {attemptedCount !== undefined && (
              <div>You tried to add: <span className="text-foreground font-medium">{attemptedCount}</span></div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button variant="hero" size="sm" onClick={handleScheduleCall} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4 mr-1.5" />
            )}
            Schedule a call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeDialog;
