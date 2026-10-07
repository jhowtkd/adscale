import { redirect } from "next/navigation";
import { z } from "zod";
import { composerHref } from "@/lib/studio/composer-href";

export type LegacyCreatePostSearchParams = Record<
  string,
  string | string[] | undefined
>;

const COMPOSER_INTENTS = new Set([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
]);

export function legacyCreatePostDestination(
  searchParams: LegacyCreatePostSearchParams
): string {
  const workIdCandidate =
    typeof searchParams.workId === "string"
      ? searchParams.workId.trim()
      : "";
  const workId = z.string().uuid().safeParse(workIdCandidate).success
    ? workIdCandidate
    : "";
  if (workId) return composerHref({ workId });

  const intent =
    typeof searchParams.intent === "string" &&
    COMPOSER_INTENTS.has(searchParams.intent)
      ? searchParams.intent
      : "variations";
  const templateId = typeof searchParams.templateId === "string"
    && z.string().uuid().safeParse(searchParams.templateId).success
    ? searchParams.templateId
    : null;
  return templateId
    ? composerHref({ intent, compose: "1", templateId })
    : composerHref({ intent });
}

export default function LegacyCreatePostRedirect({
  searchParams,
}: {
  searchParams: LegacyCreatePostSearchParams;
}): never {
  redirect(legacyCreatePostDestination(searchParams));
}
