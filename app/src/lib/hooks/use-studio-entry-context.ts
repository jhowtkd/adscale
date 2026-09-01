import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { EntryContext } from "@/lib/studio/entry-types";

async function fetchStudioEntryContext(
  clientProfileId: string,
  signal?: AbortSignal,
): Promise<EntryContext> {
  const res = await apiFetch(
    `/api/creative-work/entry-context?clientProfileId=${encodeURIComponent(clientProfileId)}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`entry-context failed: ${res.status}`);
  }
  return res.json() as Promise<EntryContext>;
}

export function useStudioEntryContext(input: {
  enabled: boolean;
  clientProfileId: string | null;
}) {
  const { enabled, clientProfileId } = input;
  return useQuery({
    queryKey: ["studio-entry-context", clientProfileId],
    enabled: Boolean(enabled && clientProfileId),
    retry: false,
    queryFn: ({ signal }) => fetchStudioEntryContext(clientProfileId!, signal),
  });
}
