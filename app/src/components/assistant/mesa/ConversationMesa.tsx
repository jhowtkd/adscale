"use client";

// Feeds the mesa for the main conversation of the account: curated inspirations on the first open, the brand taken
// from the handoff state while it is being built (pinned at the top of the conversation), and from the Library once it
// is done (scrolling with the conversation).

import { useMemo } from "react";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useWorkspaceAssets, type WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { useEquipeAccountState } from "@/lib/equipe/use-equipe";
import { handoffCards, inspirationCards, libraryCards, mesaPhase, mesaSizeFor, type MesaPhoto } from "@/lib/equipe/mesa";
import Mesa from "./Mesa";

const originOf = (asset: WorkspaceAsset): MesaPhoto["origin"] =>
  asset.source === "brand_site" ? "site" : asset.source === "brand_instagram" ? "instagram" : "user";

export default function ConversationMesa({
  accountId,
  clientProfileId,
  messages,
}: {
  accountId: string | null;
  clientProfileId: string | null;
  messages: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>;
}) {
  const state = useEquipeAccountState(accountId);
  const handoff = state.data?.handoff ?? null;
  const loaded = state.isSuccess;
  const phase = mesaPhase(handoff);

  const inspirations = useCreativeInspirations(loaded && phase === "inspirations" ? clientProfileId : null);
  const profiles = useClientProfiles();
  const library = loaded && phase === "library" && Boolean(clientProfileId);
  const images = useWorkspaceAssets({ clientProfileId: clientProfileId ?? undefined, enabled: library, kind: "images", limit: 6, excludeSources: ["curated_inspiration", "curated_inspiration_copy"] });
  const posts = useWorkspaceAssets({ clientProfileId: clientProfileId ?? undefined, enabled: library, kind: "post", limit: 6 });
  const identity = useWorkspaceAssets({ clientProfileId: clientProfileId ?? undefined, enabled: library, kind: "identity", limit: 24 });
  const profile = profiles.data?.find((entry) => entry.id === clientProfileId);

  const cards = useMemo(() => {
    if (!loaded) return [];
    if (phase === "inspirations") return inspirationCards(inspirations.data ?? []);
    if (phase === "handoff" && handoff) return handoffCards(handoff);
    const logoAsset = profile?.logoAssetKey ? identity.data?.assets.find((asset) => asset.key === profile.logoAssetKey) : undefined;
    const photos = [...(images.data?.assets ?? []), ...(posts.data?.assets ?? [])]
      .filter((asset) => !asset.metadata?.provisional)
      .map((asset): MesaPhoto => ({ id: asset.id, src: `/api/workspace/assets/${asset.id}/file`, origin: originOf(asset) }));
    return libraryCards({
      logo: logoAsset ? { id: logoAsset.id, src: `/api/workspace/assets/${logoAsset.id}/file` } : null,
      colors: profile?.brandColors ?? [],
      photos,
    });
  }, [loaded, phase, handoff, inspirations.data, images.data, posts.data, identity.data, profile]);

  if (cards.length === 0) return null;
  // The library phase is always compact: the large fan belongs to the first open.
  const size = phase === "library" ? "compact" : mesaSizeFor(messages);
  // While the brand is being read the compact mesa stays in view at the top; once the handoff is done it scrolls away
  // with the conversation, like any other part of it.
  return <Mesa cards={cards} size={size} pinned={phase !== "library" && size === "compact"} />;
}
