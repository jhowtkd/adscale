import { redirect } from "next/navigation";

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
  } else {
    const intent =
      typeof searchParams.intent === "string" &&
      COMPOSER_INTENTS.has(searchParams.intent)
        ? searchParams.intent
        : "variations";
    params.set("intent", intent);
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
