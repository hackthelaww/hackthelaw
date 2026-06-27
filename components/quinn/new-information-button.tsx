"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, FileWarning } from "lucide-react";
import { toast } from "sonner";
import type { ClauseWithFinding } from "@/lib/graph/queries";

export function NewInformationButton({
  matterId,
  clauses,
  onApplied,
}: {
  matterId: string;
  clauses: ClauseWithFinding[];
  onApplied: (clauseId: string, newStatus: string, previousStatus: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [clauseId, setClauseId] = useState<string>(clauses[0]?.clauseId ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function apply() {
    if (!clauseId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/matters/${matterId}/new-information`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clauseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);

      onApplied(clauseId, data.newStatus, data.previousStatus);
      toast.success(
        data.previousStatus && data.previousStatus !== data.newStatus
          ? `Clause flipped: ${data.previousStatus} → ${data.newStatus}`
          : `Re-assessed: ${data.newStatus}`
      );
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label="New information arrives">
              <FileWarning className="size-4" />
            </Button>
          }
        />
        <TooltipContent>New information arrives</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New information arrives</DialogTitle>
          <DialogDescription>
            Ingests the real update document as a new episode and re-assesses the selected clause
            with it in context — superseding the current fact rather than deleting it.
          </DialogDescription>
        </DialogHeader>

        <Select value={clauseId} onValueChange={(v) => setClauseId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a clause" />
          </SelectTrigger>
          <SelectContent>
            {clauses.map((c) => (
              <SelectItem key={c.clauseId} value={c.clauseId}>
                Clause {c.ref} — {c.heading}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button onClick={apply} disabled={submitting || !clauseId}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Apply and re-assess"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
