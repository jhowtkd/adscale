"use client";

import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  Check,
  Clock,
  FileWarning,
  HelpCircle,
  OctagonX,
  PencilLine,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// The single state per item, straight from the API displayState: a review
// status while the item awaits a decision, else the lifecycle state.

type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

const PILL_BY_STATE: Record<string, { tone: PillTone; icon: LucideIcon }> = {
  // Review states (awaiting a decision)
  ready: { tone: "success", icon: Check },
  needs_confirmation: { tone: "warning", icon: HelpCircle },
  edit_with_warning: { tone: "warning", icon: FileWarning },
  edited_in_review: { tone: "info", icon: PencilLine },
  blocked: { tone: "danger", icon: ShieldAlert },
  // Lifecycle states
  awaiting_approval: { tone: "neutral", icon: Clock },
  adjusting: { tone: "info", icon: RefreshCw },
  scheduled: { tone: "success", icon: CalendarCheck },
  held: { tone: "warning", icon: Clock },
  sending: { tone: "info", icon: Send },
  verifying: { tone: "info", icon: Send },
  missed_window: { tone: "neutral", icon: Clock },
  failed: { tone: "danger", icon: XCircle },
  do_not_publish: { tone: "neutral", icon: Ban },
  cancelled: { tone: "neutral", icon: OctagonX },
  published: { tone: "success", icon: Check },
  published_declared: { tone: "success", icon: Check },
  published_confirmed: { tone: "success", icon: Check },
  available_for_download: { tone: "success", icon: Check },
};

export default function EquipeStatePill({ state }: { state: string }) {
  const t = useTranslations("equipe.states");
  const pill = PILL_BY_STATE[state] ?? { tone: "neutral" as PillTone, icon: AlertTriangle };
  const Icon = pill.icon;
  const label = t.has(state) ? t(state) : state;
  // Long labels ("disponível para baixar") truncate inside narrow cards
  // instead of overflowing them; the full text stays on hover.
  return (
    <Badge
      variant={pill.tone}
      data-testid="equipe-state-pill"
      data-state={state}
      title={label}
      className="max-w-full"
    >
      <Icon aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
