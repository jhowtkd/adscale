"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  CampaignWorkspaceV6Chrome,
} from "@/components/campaigns/v6/workspace/CampaignWorkspaceV6View";
import {
  CampaignPiecesOccupancy,
  type SourcePaging,
  type OccupancyTile,
} from "@/components/campaigns/v6/workspace/CampaignPiecesOccupancy";
import type {
  CampaignWorkspaceV6ViewModel,
} from "@/components/campaigns/v6/workspace/campaign-workspace-v6-types";
import { buildCampaignWorkspaceV6Labels } from "@/components/campaigns/v6/workspace/build-campaign-workspace-v6-labels";
import { mapCampaignWorkspaceToV6View } from "@/components/campaigns/v6/workspace/map-campaign-workspace-v6";

const EMPTY_WORKSPACE_VIEW: CampaignWorkspaceV6ViewModel = {
  name: "",
  status: "draft",
  statusVariant: "neutral",
  meta: "",
  currentStage: 0,
  stages: [],
  briefingSliders: [],
  briefingRules: [],
};

const NO_DERIVATION_COUNTS = { total: 0, reviewCount: 0, approvedCount: 0 };

import { DerivationLoadErrorBanner } from "@/components/workspace/DerivationLoadErrorBanner";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import ClientProfileLinkControl from "@/components/campaigns/ClientProfileLinkControl";
import PlatformsDrawer from "@/components/campaigns/PlatformsDrawer";
import { formatCampaignPlatforms } from "@/lib/campaign-platforms";
import { AdscaleLoaderStage } from "@/components/animations";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { CampaignAssistantPanel } from "@/components/assistant/CampaignAssistantDrawer";
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import { studioInstrumentClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useTranslations } from "next-intl";
import {
  applyCampaignDeepLink,
  parseCampaignTabParam,
} from "@/lib/campaign/deep-link-tab";

export default function CampaignWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const linkedCreativeWorkId = searchParams.get("creativeWork");
  const isNew = campaignId === "new";
  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (linkedCreativeWorkId) {
      router.replace(`/creative-work/${linkedCreativeWorkId}`);
    }
  }, [linkedCreativeWorkId, router]);

  useEffect(() => {
    if (isNew) {
      window.location.replace("/campaigns/new");
    }
  }, [isNew]);

  const tc = useTranslations("common");
  const tCampaign = useTranslations("campaign");
  const tWorkspaceMobile = useTranslations("campaign.workspace");
  const tFreePlan = useTranslations("billing.conversion.freePlan");
  // Ticket 11, part 2: the campaign assistant runs outside the Strategist and the free ceiling, so the free plan does
  // not get it (the chat route refuses it too). The panel waits until the plan is known instead of flashing.
  const freePlan = useFreePlanAccount();
  const addToast = useAppStore((s) => s.addToast);
  const updateCampaign = useUpdateCampaign(campaignId);

  const [platformsDrawerOpen, setPlatformsDrawerOpen] = useState(false);
  // Mobile (< lg) toggles between the workspace grid and the chat panel.
  const [mobileView, setMobileView] = useState<"grid" | "chat">("grid");

  const {
    campaign,
    isLoading,
    isError,
    loadErrorKind,
    refetchCampaign,
    isDerivationsError,
    derivationsErrorKind,
    refetchDerivations,
    derivationSummary,
    loadedDerivations,
    hasMoreDerivations,
    loadMoreDerivations,
    loadingMoreDerivations,
    loadMoreDerivationsFailed,
    workspaceState,
    isGenerating,
    goToSetup,
    goToTrabalho,
    handleDelete,
    handleDeleteClick,
    showDeleteDialog,
    setShowDeleteDialog,
  } = useCampaignWorkspace(campaignId, isNew);

  const workspaceLabels = useMemo(
    () => buildCampaignWorkspaceV6Labels(tCampaign, tc),
    [tCampaign, tc],
  );

  const workspaceView = useMemo(
    () =>
      campaign
        ? mapCampaignWorkspaceToV6View({
            campaign,
            counts: derivationSummary ?? NO_DERIVATION_COUNTS,
            workspaceState,
            isGenerating,
            tStatus: (key) => tCampaign(`status.${key}`),
            tWorkspace: (key, values) => tCampaign(`v6.${key}`, values),
            formatDate: (date) =>
              date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }),
          })
        : EMPTY_WORKSPACE_VIEW,
    [campaign, derivationSummary, workspaceState, isGenerating, tCampaign],
  );

  useEffect(() => {
    if (isLoading || isNew || !campaign) return;

    const parsed = parseCampaignTabParam(
      searchParams.get("tab"),
      searchParams.get("mode")
    );
    if (!parsed) return;

    const deepLinkKey = `${parsed.tab}:${parsed.mode ?? ""}`;
    if (appliedDeepLinkRef.current === deepLinkKey) return;
    appliedDeepLinkRef.current = deepLinkKey;

    applyCampaignDeepLink(parsed.tab, parsed.mode, {
      goToSetup,
      goToTrabalho,
      hasDerivations: (derivationSummary?.total ?? 0) > 0,
    });
  }, [
    derivationSummary?.total,
    campaign,
    campaignId,
    goToTrabalho,
    goToSetup,
    isLoading,
    isNew,
    searchParams,
  ]);

  if (isLoading || linkedCreativeWorkId) return <AdscaleLoaderStage label={tc("loading")} />;
  if (isError) {
    return (
      <CampaignErrorState
        kind={loadErrorKind ?? "unknown"}
        onRetry={() => void refetchCampaign()}
      />
    );
  }
  if (!campaign) {
    return loadErrorKind === "not_found" ? <CampaignNotFoundState /> : <CampaignErrorState kind="unknown" />;
  }

  const isDraft = campaign?.status === "draft";
  const platformsText = formatCampaignPlatforms(campaign?.platforms);
  const derivationImages: OccupancyTile[] = loadedDerivations
    .filter((derivation) => Boolean(derivation.imageUrl))
    .map((derivation) => ({
      id: `derivation:${derivation.id}`,
      href: null,
      src: derivation.imageUrl!,
      alt: derivation.name,
    }));

  const handleSavePlatforms = async (platforms: string[]) => {
    try {
      await updateCampaign.mutateAsync({ platforms });
      addToast("success", tc("platformsSaved"));
      setPlatformsDrawerOpen(false);
    } catch {
      addToast("error", tc("failedSavePlatforms"));
    }
  };

  return (
    <div className={`${studioInstrumentClass} py-0 pb-6 min-w-0 workspace-scroll-padding shell-offset-bottom-mobile`}>
      <div className="workspace-split lg:grid lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Main workspace column. Always visible on desktop; toggled on mobile. */}
        <div
          className={cn(
            "workspace-main min-w-0 space-y-4 lg:block",
            mobileView === "grid" ? "block" : "hidden lg:block"
          )}
        >
          <CampaignWorkspaceV6Chrome
            view={workspaceView}
            labels={workspaceLabels}
            campaignId={campaignId}
            isDraft={isDraft}
            onDelete={handleDeleteClick}
          />

          {campaign && (
            <CampaignClientSubtitle
              platformsText={platformsText}
              onAddPlatform={() => setPlatformsDrawerOpen(true)}
            />
          )}

          {campaign && !campaign.clientProfileId ? (
            <ClientProfileLinkControl
              campaignId={campaignId}
              clientName={campaign.client}
              clientProfileId={campaign.clientProfileId}
              variant="banner"
            />
          ) : null}

          <PlatformsDrawer
            open={platformsDrawerOpen}
            onOpenChange={setPlatformsDrawerOpen}
            selectedPlatforms={campaign?.platforms ?? []}
            isSaving={updateCampaign.isPending}
            onSave={handleSavePlatforms}
          />
          <CampaignWorkspaceCard
            campaignId={campaignId}
            clientProfileId={campaign.clientProfileId ?? null}
            derivationImages={derivationImages}
            derivationsPaging={{
              hasMore: Boolean(hasMoreDerivations),
              loading: loadingMoreDerivations,
              failed: loadMoreDerivationsFailed,
              load: () => void loadMoreDerivations(),
            }}
            isDerivationsError={isDerivationsError}
            derivationsErrorKind={derivationsErrorKind}
            onRetryDerivations={() => void refetchDerivations()}
          />
        </div>

        {/* Permanent assistant panel. Fixed column on desktop; toggled on mobile. */}
        <aside
          aria-label={tWorkspaceMobile("assistantLabel")}
          className={cn(
            "workspace-chat border-l border-[var(--border-subtle)] lg:block",
            mobileView === "chat"
              ? "block min-h-[60vh]"
              : "hidden lg:block"
          )}
        >
          <div className="flex h-full min-h-0 flex-col lg:sticky lg:top-[calc(var(--shell-topbar-desktop)+var(--shell-sticky-gap))] lg:h-[calc(100vh-var(--shell-topbar-desktop)-var(--shell-sticky-gap)-1rem)]">
            {freePlan === null ? (
              <CampaignAssistantPanel
                campaignId={campaignId}
                clientProfileId={campaign?.clientProfileId ?? ""}
              />
            ) : freePlan ? (
              <FreePlanCta
                accountId={freePlan.accountId}
                intro={tFreePlan("campaignAssistant")}
                className="flex flex-col items-start gap-2 p-4"
              />
            ) : null}
          </div>
        </aside>
      </div>

      {/* Mobile-only Grid/Chat tab toggle (hidden on >= lg). */}
      <div
        className="mt-4 lg:hidden"
      >
        <DiscreetRadios
          label={tWorkspaceMobile("viewToggleLabel")}
          value={mobileView}
          onChange={setMobileView}
          options={[
            { value: "grid", label: tWorkspaceMobile("gridTab") },
            { value: "chat", label: tWorkspaceMobile("chatTab") },
          ]}
        />
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={tCampaign("deleteDialog.title")}
        description={tCampaign("deleteDialog.description")}
        confirmLabel={tCampaign("deleteDialog.confirmLabel")}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface CampaignWorkspaceCardProps {
  campaignId: string;
  clientProfileId: string | null;
  derivationImages: OccupancyTile[];
  derivationsPaging: SourcePaging;
  isDerivationsError?: boolean;
  derivationsErrorKind?: string | null;
  onRetryDerivations?: () => void;
}

function CampaignWorkspaceCard({
  campaignId,
  clientProfileId,
  derivationImages,
  derivationsPaging,
  isDerivationsError,
  derivationsErrorKind,
  onRetryDerivations,
}: CampaignWorkspaceCardProps) {
  return (
    <section className="min-h-[400px]">
      {isDerivationsError && derivationsErrorKind ? (
        <div className="mb-3">
          <DerivationLoadErrorBanner
            kind={derivationsErrorKind}
            onRetry={onRetryDerivations}
          />
        </div>
      ) : null}
      <CampaignPiecesOccupancy
        campaignId={campaignId}
        clientProfileId={clientProfileId}
        derivationImages={derivationImages}
        derivationsPaging={derivationsPaging}
      />
    </section>
  );
}
