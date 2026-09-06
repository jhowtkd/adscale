export const STUDIO_RESUME_QUERY_KEYS = [
  "workId",
  "intent",
  "mode",
  "fresh",
  "compose",
  "templateId",
  "campaignId",
] as const;

export function hasStudioResumeQuery(searchParams: URLSearchParams): boolean {
  return STUDIO_RESUME_QUERY_KEYS.some((key) => {
    const value = searchParams.get(key);
    return Boolean(value && value.trim());
  });
}
