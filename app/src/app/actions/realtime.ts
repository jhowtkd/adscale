"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { inngest } from "@/server/jobs/client";
import { derivationChannel } from "@/server/jobs/channels";
import { getDerivationById } from "@/server/repositories/derivation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

export async function getDerivationRealtimeToken(derivationId: string) {
  const { workspace } = await requireWorkspaceAccess();

  const derivation = await getDerivationById(derivationId, workspace.id);
  if (!derivation) {
    throw new Error("Derivation not found");
  }

  return getClientSubscriptionToken(inngest, {
    channel: derivationChannel({ derivationId }),
    topics: ["status"],
  });
}
