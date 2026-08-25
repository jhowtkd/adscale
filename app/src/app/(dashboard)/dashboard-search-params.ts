import type { ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import { z } from "zod";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export type StudioMode = "arte" | "briefing";

const COMPOSER_INTENTS = new Set<ComposerIntent>([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
]);
const STUDIO_MODES = new Set<StudioMode>(["arte", "briefing"]);

export function parseDashboardSearchParams(searchParams: DashboardSearchParams): {
  workId?: string;
  initialIntent: ComposerIntent;
  studioMode?: StudioMode;
  focusComposer?: true;
  templateId?: string;
} {
  const workIdCandidate = typeof searchParams.workId === "string" ? searchParams.workId.trim() : "";
  const workId = z.string().uuid().safeParse(workIdCandidate).success ? workIdCandidate : "";
  const intent = typeof searchParams.intent === "string"
    && COMPOSER_INTENTS.has(searchParams.intent as ComposerIntent)
    ? searchParams.intent as ComposerIntent
    : undefined;
  const studioMode = typeof searchParams.mode === "string"
    && STUDIO_MODES.has(searchParams.mode as StudioMode)
    ? searchParams.mode as StudioMode
    : undefined;
  const templateId = typeof searchParams.templateId === "string"
    && z.string().uuid().safeParse(searchParams.templateId).success
    ? searchParams.templateId
    : undefined;

  return {
    ...(workId ? { workId } : {}),
    // An explicit protocol is a resume/deep-link contract. Otherwise the
    // studio mode selects the least surprising canonical protocol.
    initialIntent: intent ?? (studioMode === "briefing" ? "single" : "variations"),
    ...(studioMode ? { studioMode } : {}),
    ...(searchParams.compose === "1" ? { focusComposer: true as const } : {}),
    ...(templateId ? { templateId } : {}),
  };
}
