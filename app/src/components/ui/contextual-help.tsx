"use client";

import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ContextualHelp({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();

  return (
    <Tooltip
      open={open}
      onOpenChange={setOpen}
    >
      <TooltipTrigger
        closeOnClick={false}
        aria-describedby={open ? descriptionId : undefined}
        render={
          <button
            type="button"
            aria-label={label}
            onClick={() => setOpen((currentOpen) => !currentOpen)}
            className={cn(
              "inline-flex size-[var(--control-touch)] items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            )}
          >
            <CircleHelp size={16} aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent
        id={descriptionId}
        role="tooltip"
        className="max-w-sm items-start px-3 py-2 text-left leading-5"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
