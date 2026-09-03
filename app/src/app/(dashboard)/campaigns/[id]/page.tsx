"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import {
  CampaignWorkspaceV6Chrome,
} from "@/components/campaigns/v6/workspace/CampaignWorkspaceV6View";
import { CampaignPiecesOccupancy, type OccupancyTile } from "@/components/campaigns/v6/workspace/CampaignPiecesOccupancy";
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

const DeliveryPackageModal = dynamic(() => import("@/components/workspace/DeliveryPackageModal"), {
  ssr: false,
  loading: () => null,
});

const DerivationReviewSheet = dynamic(() => import("@/components/workspace/DerivationReviewSheet"), {
  ssr: false,
  loading: () => null,
});

import StrategyRecipePanel from "@/components/workspace/StrategyRecipePanel";
import { DerivationLoadErrorBanner } from "@/components/workspace/DerivationLoadErrorBanner";

import CampaignClientSubtitle from "@/components/campaigns/CampaignClientSubtitle";
import ClientProfileLinkControl from "@/components/campaigns/ClientProfileLinkControl";
import PlatformsDrawer from "@/components/campaigns/PlatformsDrawer";
import { formatCampaignPlatforms } from "@/lib/campaign-platforms";
import type {
  CampaignRecipeContext,
} from "@/lib/domain/strategy-recipe-types";
import { AdscaleLoaderStage } from "@/components/animations";
import CampaignErrorState from "@/components/campaigns/CampaignErrorState";
import CampaignNotFoundState from "@/components/campaigns/CampaignNotFoundState";

import { CampaignAssistantPanel } from "@/components/assistant/CampaignAssistantDrawer";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import { studioInstrumentClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import { useCampaignWorkspace } from "@/lib/hooks/use-campaign-workspace";
import { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useDerivationFlow } from "@/lib/hooks/use-derivation-flow";
import { usePreflightScore } from "@/lib/hooks/use-preflight";
import {
  resolveBrandKitClientProfileId,
  shouldFetchBrandKit,
  useBrandKit,
} from "@/lib/hooks/use-brand-kit";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useTranslations } from "next-intl";
import {
  applyCampaignDeepLink,
  parseCampaignTabParam,
  scrollToCampaignDeepLink,
  type CampaignTabDeepLink,
} from "@/lib/campaign/deep-link-tab";
import type { WorkspaceStageNavTab } from "@/components/campaigns/v6/workspace/campaign-workspace-v6-types";

type WorkspaceHookResult = ReturnType<typeof useCampaignWorkspace>;

export default function CampaignWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const linkedCreativeWorkId = searchParams.get("creativeWork");
  const isNew = campaignId === "new";
  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNew) {
      window.location.replace("/campaigns/new");
    }
  }, [isNew]);

  const tc = useTranslations("common");
  const tCampaign = useTranslations("campaign");
  const tWorkspaceMobile = useTranslations("campaign.workspace");
  const addToast = useAppStore((s) => s.addToast);
  const updateCampaign = useUpdateCampaign(campaignId);

  const [platformsDrawerOpen, setPlatformsDrawerOpen] = useState(false);
  // Mobile (< lg) toggles between the workspace grid and the chat panel.
  const [mobileView, setMobileView] = useState<"grid" | "chat">("grid");
  const {
    isDerivePanelOpen,
    derivePanelSession,
    recipePrefill,
    pendingOutputLearningApplication,
    openDerivePanel,
    closeFlow,
  } = useDerivationFlow();

  const {
    campaign,
    workspaceId,
    isLoading,
    isError,
    loadErrorKind,
    refetchCampaign,
    isDerivationsError,
    derivationsErrorKind,
    refetchDerivations,
    allDerivations,
    reviewDerivationId,
    handleCloseReview,
    handleRequestRegenerate,
    workspaceState,
    isGenerating,
    deliveryModalOpen,
    selectedDeliverySource,
    handleDeliveryModalOpenChange,
    goToSetup,
    goToTrabalho,
    configureAndGenerate,
    handleApproveDerivation,
    handleRejectDerivation,
    handleReviewDecision,
    handleConfirmDeliveryPackage,
    handleDownloadDeliverySource,
    handleDelete,
    handleDeleteClick,
    showDeleteDialog,
    setShowDeleteDialog,
    reviewPending,
    reviewVariables,
    regeneratePending,
    createDerivationsPending,
    exportPending,
    deliveryPackagePending,
  } = useCampaignWorkspace(campaignId, isNew, {
    pendingOutputLearningApplication,
  });

  const { data: campaignAssets } = useCampaignAssets(campaignId);
  const { data: clientProfiles, isSuccess: clientProfilesLoaded } = useClientProfiles();
  const brandKitClientProfileId = useMemo(
    () =>
      resolveBrandKitClientProfileId({
        clientProfileId: campaign?.clientProfileId,
        clientProfiles,
      }),
    [campaign?.clientProfileId, clientProfiles]
  );
  const brandKitQueryEnabled = useMemo(
    () =>
      Boolean(campaign) &&
      shouldFetchBrandKit({
        clientProfileId: campaign?.clientProfileId,
        clientProfiles,
        profilesLoaded: clientProfilesLoaded,
      }),
    [campaign, clientProfiles, clientProfilesLoaded]
  );
  const { data: brandKitData } = useBrandKit(brandKitClientProfileId, {
    enabled: brandKitQueryEnabled,
  });
  const brandKit = brandKitQueryEnabled ? brandKitData ?? null : null;
  const reviewDerivation = useMemo(
    () => allDerivations.find((item) => item.id === reviewDerivationId) ?? null,
    [allDerivations, reviewDerivationId]
  );
  const baseAsset = useMemo(
    () => campaignAssets?.find((asset) => asset.role === "base") ?? campaignAssets?.[0] ?? null,
    [campaignAssets]
  );
  const styleAsset = useMemo(() => {
    if (!reviewDerivation?.styleAssetId || !campaignAssets) return null;
    return campaignAssets.find((asset) => asset.id === reviewDerivation.styleAssetId) ?? null;
  }, [reviewDerivation, campaignAssets]);
  const { data: preflightData } = usePreflightScore({
    campaignId,
    assetId: baseAsset?.id ?? null,
  });

  const workspaceLabels = useMemo(
    () => buildCampaignWorkspaceV6Labels(tCampaign, tc),
    [tCampaign, tc],
  );

  const workspaceView = useMemo(
    () =>
      campaign
        ? mapCampaignWorkspaceToV6View({
            campaign,
            derivations: allDerivations,
            workspaceState,
            isGenerating,
            tStatus: (key) => tCampaign(`status.${key}`),
            tWorkspace: (key, values) => tCampaign(`v6.${key}`, values),
            formatDate: (date) =>
              date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }),
          })
        : EMPTY_WORKSPACE_VIEW,
    [campaign, allDerivations, workspaceState, isGenerating, tCampaign],
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
      hasDerivations: allDerivations.length > 0,
      openStrategyRecipe: openDerivePanel,
    });
  }, [
    allDerivations.length,
    campaign,
    campaignId,
    goToTrabalho,
    goToSetup,
    isLoading,
    isNew,
    openDerivePanel,
    searchParams,
  ]);

  const handleStageSelect = (tab: WorkspaceStageNavTab) => {
    // share is a valid CampaignTabDeepLink (mission-share / deliver)
    const deepTab = tab as CampaignTabDeepLink;
    if (tab === "briefing") {
      goToSetup();
    } else {
      goToTrabalho();
    }
    // Stage strip navigates to sections; does not open the strategy modal.
    scrollToCampaignDeepLink(deepTab);
  };

  const handleCloseDerivationFlow = () => {
    closeFlow();
    goToTrabalho();
  };

  const campaignRecipeContext = useMemo<CampaignRecipeContext>(
    () => ({
      ctaVariants: campaign?.ctaVariants,
      targetFormats: campaign?.targetFormats,
      platforms: campaign?.platforms,
      generationMode: campaign?.generationMode,
      creativeLevel: campaign?.creativeLevel,
      suggestedCta: "",
    }),
    [
      campaign?.ctaVariants,
      campaign?.targetFormats,
      campaign?.platforms,
      campaign?.generationMode,
      campaign?.creativeLevel,
    ]
  );

  const handleDerivePreview = async (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants?: string[];
    targetFormats?: string[];
  }) => {
    closeFlow();
    goToTrabalho();
    await configureAndGenerate(patch, { preview: true });
  };

  if (isLoading) return <AdscaleLoaderStage label={tc("loading")} />;
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
  const derivationImages: OccupancyTile[] = allDerivations
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
      {linkedCreativeWorkId ? (
        <CreativeWorkResumeSurface workId={linkedCreativeWorkId} campaignId={campaignId} />
      ) : null}
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
            onStageSelect={handleStageSelect}
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
            <CampaignAssistantPanel
              campaignId={campaignId}
              clientProfileId={campaign?.clientProfileId ?? ""}
            />
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

      <DerivationReviewSheet
        open={Boolean(reviewDerivationId && reviewDerivation)}
        derivation={reviewDerivation}
        workspaceId={workspaceId ?? campaign?.workspaceId}
        campaignId={campaignId}
        clientProfileId={campaign?.clientProfileId}
        campaignClient={campaign?.client}
        baseAsset={baseAsset}
        styleAsset={styleAsset}
        isRegenerating={regeneratePending}
        isApproving={
          reviewPending &&
          (reviewVariables?.decision === "entra" || reviewVariables?.status === "approved")
        }
        isRejecting={
          reviewPending &&
          (reviewVariables?.decision === "nao_entra" ||
            reviewVariables?.decision === "quase_regenerar" ||
            reviewVariables?.status === "rejected")
        }
        onOpenChange={(open) => {
          if (!open) handleCloseReview();
        }}
        onRegenerateWithFixes={() => {
          if (reviewDerivationId) {
            handleRequestRegenerate(reviewDerivationId);
          }
        }}
        onSubmitDecision={(input) => {
          if (reviewDerivationId) {
            handleReviewDecision(reviewDerivationId, input);
          }
        }}
        onApprove={
          reviewDerivationId
            ? () => handleApproveDerivation(reviewDerivationId)
            : undefined
        }
        onReject={
          reviewDerivationId
            ? () => handleRejectDerivation(reviewDerivationId)
            : undefined
        }
      />

      <CampaignWorkspaceModals
        selectedDeliverySource={selectedDeliverySource}
        visibility={{
          delivery: deliveryModalOpen,
          derivePanel: isDerivePanelOpen,
          delete: showDeleteDialog,
        }}
        readiness={preflightData?.readiness}
        brandKit={brandKit}
        campaignRecipeContext={campaignRecipeContext}
        onDerivePreview={handleDerivePreview}
        derivePanelSession={derivePanelSession}
        recipePrefill={recipePrefill}
        pending={{
          export: exportPending,
          deliveryPackage: deliveryPackagePending,
          derivation: createDerivationsPending,
        }}
        onDeliveryModalOpenChange={handleDeliveryModalOpenChange}
        onDownloadDeliverySource={handleDownloadDeliverySource}
        onConfirmDeliveryPackage={handleConfirmDeliveryPackage}
        onCloseDerivationFlow={handleCloseDerivationFlow}
        campaignId={campaignId}
        campaignCreativeLevel={campaign?.creativeLevel}
        suggestedCta=""
        onDeleteDialogOpenChange={setShowDeleteDialog}
        onConfirmDelete={handleDelete}
      />
    </div>
  );
}

interface CampaignWorkspaceCardProps {
  campaignId: string;
  clientProfileId: string | null;
  derivationImages: OccupancyTile[];
  isDerivationsError?: boolean;
  derivationsErrorKind?: string | null;
  onRetryDerivations?: () => void;
}

function CampaignWorkspaceCard({
  campaignId,
  clientProfileId,
  derivationImages,
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
      />
    </section>
  );
}

interface CampaignWorkspaceModalVisibility {
  delivery: boolean;
  derivePanel: boolean;
  delete: boolean;
}

interface CampaignWorkspaceModalPending {
  export: boolean;
  deliveryPackage: boolean;
  derivation: boolean;
}

interface CampaignWorkspaceModalsProps {
  selectedDeliverySource: WorkspaceHookResult["selectedDeliverySource"];
  visibility: CampaignWorkspaceModalVisibility;
  pending: CampaignWorkspaceModalPending;
  onDeliveryModalOpenChange: (open: boolean) => void;
  onDownloadDeliverySource: () => void;
  onConfirmDeliveryPackage: (formats: DeliveryFormat[]) => void;
  onCloseDerivationFlow: () => void;
  campaignId: string;
  campaignCreativeLevel?: string | null;
  suggestedCta?: string;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  readiness?: import("@/server/ai/creative-readiness").CreativeReadinessResult | null;
  brandKit?: import("@/lib/hooks/use-brand-kit").BrandKitWithUrl | null;
  campaignRecipeContext?: import("@/server/ai/strategy-recipes").CampaignRecipeContext;
  onDerivePreview: (patch: {
    generationMode: "art_variation" | "format_adaptation";
    creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
    ctaVariants?: string[];
    targetFormats?: string[];
  }) => void | Promise<void>;
  derivePanelSession: number;
  recipePrefill?: import("@/lib/hooks/use-strategy-recipe").StrategyRecipePrefill | null;
}

function CampaignWorkspaceModals({
  selectedDeliverySource,
  visibility,
  pending,
  onDeliveryModalOpenChange,
  onDownloadDeliverySource,
  onConfirmDeliveryPackage,
  onCloseDerivationFlow,
  campaignId,
  campaignCreativeLevel,
  suggestedCta,
  onDeleteDialogOpenChange,
  onConfirmDelete,
  readiness,
  brandKit,
  campaignRecipeContext,
  onDerivePreview,
  derivePanelSession,
  recipePrefill,
}: CampaignWorkspaceModalsProps) {
  const tCampaign = useTranslations("campaign");
  return (
    <>
      {selectedDeliverySource && (
        <DeliveryPackageModal
          open={visibility.delivery}
          sourceFormat={selectedDeliverySource.format ?? null}
          isDownloading={pending.export}
          isSubmitting={pending.deliveryPackage}
          onOpenChange={onDeliveryModalOpenChange}
          onDownloadCurrent={onDownloadDeliverySource}
          onConfirm={onConfirmDeliveryPackage}
        />
      )}

      <StrategyRecipePanel
        campaignId={campaignId}
        open={visibility.derivePanel}
        recipeSessionKey={derivePanelSession}
        readiness={readiness}
        brandKit={
          brandKit
            ? {
                constraints: brandKit.constraints,
                toneOfVoice: brandKit.toneOfVoice,
                prohibitedElements: brandKit.prohibitedElements,
              }
            : null
        }
        campaign={campaignRecipeContext}
        campaignCreativeLevel={campaignCreativeLevel}
        suggestedCta={suggestedCta}
        initialPrefill={recipePrefill}
        isSubmitting={pending.derivation}
        onClose={onCloseDerivationFlow}
        onGeneratePreview={onDerivePreview}
      />

      <ConfirmDialog
        open={visibility.delete}
        onOpenChange={onDeleteDialogOpenChange}
        title={tCampaign("deleteDialog.title")}
        description={tCampaign("deleteDialog.description")}
        confirmLabel={tCampaign("deleteDialog.confirmLabel")}
        variant="destructive"
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
