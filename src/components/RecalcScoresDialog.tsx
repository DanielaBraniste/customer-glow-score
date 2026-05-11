import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { History, FastForward, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (recalcHistory: boolean) => void;
  isSaving: boolean;
}

const RecalcScoresDialog = ({ open, onOpenChange, onConfirm, isSaving }: Props) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Apply new weights to historical scores?</AlertDialogTitle>
          <AlertDialogDescription>
            You've changed how the health score is calculated. Choose how this change should apply
            to your existing data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2">
          <button
            onClick={() => onConfirm(true)}
            disabled={isSaving}
            className="w-full text-left rounded-lg border border-border hover:border-primary/50 bg-card hover:bg-primary/5 transition-colors p-4 disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <History className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm mb-1">Recalculate all historical scores</div>
                <p className="text-xs text-muted-foreground">
                  Re-score every past snapshot with the new weights. The Health Progression chart and
                  all stored scores will reflect the change. This can take a moment for large datasets.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onConfirm(false)}
            disabled={isSaving}
            className="w-full text-left rounded-lg border border-border hover:border-primary/50 bg-card hover:bg-primary/5 transition-colors p-4 disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                <FastForward className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <div className="font-semibold text-sm mb-1">Apply only to future imports</div>
                <p className="text-xs text-muted-foreground">
                  Keep historical scores frozen as they are. New imports and edits going forward will
                  use the new weights.
                </p>
              </div>
            </div>
          </button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          {isSaving && (
            <Button variant="ghost" size="sm" disabled className="gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RecalcScoresDialog;
