import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import type { ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import { z } from "zod";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

const COMPOSER_INTENTS = new Set<ComposerIntent>([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
]);

export function parseDashboardSearchParams(searchParams: DashboardSearchParams): {
  workId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: true;
  templateId?: string;
} {
  const workId = typeof searchParams.workId === "string"
    ? searchParams.workId.trim()
    : "";
  const intent = typeof searchParams.intent === "string"
    && COMPOSER_INTENTS.has(searchParams.intent as ComposerIntent)
    ? searchParams.intent as ComposerIntent
    : undefined;
  const templateId = typeof searchParams.templateId === "string"
    && z.string().uuid().safeParse(searchParams.templateId).success
    ? searchParams.templateId
    : undefined;

  return {
    ...(workId ? { workId } : {}),
    ...(intent ? { initialIntent: intent } : {}),
    ...(searchParams.compose === "1" ? { focusComposer: true as const } : {}),
    ...(templateId ? { templateId } : {}),
  };
}

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardHomeActions {...parseDashboardSearchParams(await searchParams)} />;
}
