"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { getDerivationRealtimeToken } from "@/app/actions/realtime";

interface DerivationStatusMessage {
  derivationId: string;
  status: string;
  imageUrl?: string | null;
  outputKey?: string | null;
  updatedAt: string;
}

export function useDerivationRealtime(derivationId: string, campaignId: string) {
  const queryClient = useQueryClient();
  const channel = `derivation:${derivationId}`;

  const { connectionStatus, messages } = useRealtime({
    channel,
    topics: ["status"],
    token: () => getDerivationRealtimeToken(derivationId),
    enabled: !!derivationId,
  });

  // Sync incoming messages to TanStack Query cache
  useEffect(() => {
    const statusMsg = messages.byTopic.status?.data as DerivationStatusMessage | undefined;
    if (!statusMsg) return;

    // Update the derivations list cache
    queryClient.setQueryData<unknown[]>(
      ["derivations", campaignId],
      (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((d: { id: string; imageUrl?: string; outputKey?: string; status?: string; updatedAt?: Date }) =>
          d.id === statusMsg.derivationId
            ? {
                ...d,
                status: statusMsg.status,
                imageUrl: statusMsg.imageUrl ?? d.imageUrl,
                outputKey: statusMsg.outputKey ?? d.outputKey,
                updatedAt: statusMsg.updatedAt,
              }
            : d
        );
      }
    );

    // Also invalidate to trigger background refetch for complete data
    queryClient.invalidateQueries({
      queryKey: ["derivations", campaignId],
    });
  }, [messages, queryClient, campaignId, derivationId]);

  return { connectionStatus };
}
