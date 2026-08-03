import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionStatus = "idle" | "pending" | "success" | "error";

export function ActionStatusIcon({ state }: { state: ActionStatus }) {
  if (state === "idle") return null;

  const Icon = state === "pending" ? LoaderCircle : state === "success" ? Check : CircleAlert;

  return (
    <span
      key={state}
      data-testid="action-status-icon"
      data-action-status={state}
      aria-hidden="true"
      className="motion-feedback-enter inline-flex"
    >
      <Icon size={16} className={cn(state === "pending" && "animate-spin")} />
    </span>
  );
}
