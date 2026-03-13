import { useState } from "react";
import { useDuplicateCompanies, useMergeDuplicates } from "@/hooks/useCompanies";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Merge, Loader2 } from "lucide-react";

const DeduplicateBanner = () => {
  const { data: duplicateGroups = [], isLoading } = useDuplicateCompanies();
  const mergeMutation = useMergeDuplicates();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading || duplicateGroups.length === 0) return null;

  const totalDupes = duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);

  return (
    <>
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {totalDupes} duplicate compan{totalDupes === 1 ? "y" : "ies"}
            </span>{" "}
            detected across {duplicateGroups.length} group{duplicateGroups.length !== 1 ? "s" : ""}.
            Merging will consolidate snapshot history under one record and remove duplicate entries. Daily import data is preserved.
          </p>
        </div>
        <Button variant="heroOutline" size="sm" onClick={() => setDialogOpen(true)}>
          <Merge className="h-4 w-4 mr-1.5" /> Review & Merge
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>Merge Duplicate Companies</DialogTitle>
            <DialogDescription>
              The following companies have duplicate entries. Merging keeps the oldest record,
              reassigns all snapshot history to it (daily import data is fully preserved),
              and removes the duplicate company rows.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-3 py-2">
            {duplicateGroups.map((group) => (
              <div key={group.name} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.duplicates.length + 1} records → 1
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    Keep: <span className="text-foreground">{group.primary.name}</span> (created first)
                  </p>
                  <p>Remove: {group.duplicates.map((d) => d.name).join(", ")}</p>
                  <p>
                    {group.totalSnapshots} snapshot{group.totalSnapshots !== 1 ? "s" : ""} total
                    {" · "}
                    {group.totalSnapshots - group.conflictingDates} preserved
                    {group.conflictingDates > 0 && (
                      <span className="text-yellow-500">
                        {" · "}
                        {group.conflictingDates} same-date conflict{group.conflictingDates !== 1 ? "s" : ""} (primary wins)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {duplicateGroups.some((g) => g.conflictingDates > 0) && (
            <p className="text-xs text-muted-foreground">
              Same-date conflicts occur when both the primary and a duplicate have a snapshot on the exact same day.
              The primary's snapshot is kept. Snapshots on different dates are always preserved — your daily import history is safe.
            </p>
          )}

          <DialogFooter>
            <Button variant="heroOutline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              size="sm"
              onClick={async () => {
                await mergeMutation.mutateAsync(duplicateGroups);
                setDialogOpen(false);
              }}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Merging…
                </>
              ) : (
                <>
                  <Merge className="h-4 w-4 mr-1.5" /> Merge All ({totalDupes} duplicates)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeduplicateBanner;
