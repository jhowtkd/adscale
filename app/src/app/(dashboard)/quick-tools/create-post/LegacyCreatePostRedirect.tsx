import { redirect } from "next/navigation";
import { z } from "zod";

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
  const workId =
    typeof searchParams.workId === "string"
      ? searchParams.workId.trim()
      : "";
  const params = new URLSearchParams();

  if (workId) {
    params.set("workId", workId);
    return `/?${params.toString()}`;
  }

  const intent =
    typeof searchParams.intent === "string" &&
    COMPOSER_INTENTS.has(searchParams.intent)
      ? searchParams.intent
      : "variations";
  params.set("intent", intent);

  const templateId = typeof searchParams.templateId === "string"
    && z.string().uuid().safeParse(searchParams.templateId).success
    ? searchParams.templateId
    : null;
  if (templateId) {
    params.set("compose", "1");
    params.set("templateId", templateId);
  }

  return `/?${params.toString()}`;
}

export default function LegacyCreatePostRedirect({
  searchParams,
}: {
  searchParams: LegacyCreatePostSearchParams;
}): never {
  redirect(legacyCreatePostDestination(searchParams));
}
