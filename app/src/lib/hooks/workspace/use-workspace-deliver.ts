"use client";

import { useCallback, useState } from "react";
import type { Derivation } from "@/lib/mock-data";
import type { DeliveryFormat } from "@/components/workspace/DeliveryPackageModal";
import type {
  DeliveryPackageHandle,
  ExportHandle,
} from "@/lib/hooks/workspace/mutation-handles";

/**
 * Deliver / export package flow (Phase 6 / item 48).
 */
export function useWorkspaceDeliver(deps: {
  campaignId: string;
  allDerivations: Derivation[];
  exportMutation: ExportHandle;
  createDeliveryPackage: DeliveryPackageHandle;
  addToast: (type: "success" | "error" | "info", message: string) => void;
  tc: (key: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  missionInsight?: { maybePromptMissionInsight: (...args: any[]) => void } | null;
}) {
  const {
    campaignId,
    allDerivations,
    exportMutation,
    createDeliveryPackage,
    addToast,
    tc,
    missionInsight,
  } = deps;

  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedDeliverySource, setSelectedDeliverySource] =
    useState<Derivation | null>(null);

  const handleDeliveryModalOpenChange = useCallback((open: boolean) => {
    setDeliveryModalOpen(open);
    if (!open) setSelectedDeliverySource(null);
  }, []);

  const handleDownloadDerivation = useCallback(
    (id: string) =>
      exportMutation.mutate(
        { type: "individual", derivationId: id, format: "png" },
        {
          onSuccess: () => {
            missionInsight?.maybePromptMissionInsight({
              moment: "export_first",
              missionKey: "export",
              campaignId,
              derivationId: id,
              diagnosticContext: { operation: "export", format: "png" },
            });
          },
        }
      ),
    [exportMutation, missionInsight, campaignId]
  );

  const handleCreateDeliveryPackage = useCallback(
    (id: string) => {
      const derivation = allDerivations.find((d) => d.id === id);
      if (derivation) {
        setSelectedDeliverySource(derivation);
        setDeliveryModalOpen(true);
      }
    },
    [allDerivations]
  );

  const handleConfirmDeliveryPackage = useCallback(
    (formats: DeliveryFormat[]) => {
      if (!selectedDeliverySource) return;
      createDeliveryPackage.mutate(
        { derivationId: selectedDeliverySource.id, formats },
        {
          onSuccess: () => {
            addToast("success", tc("packageQueued"));
            handleDeliveryModalOpenChange(false);
          },
          onError: () => addToast("error", tc("packageFailed")),
        }
      );
    },
    [
      selectedDeliverySource,
      createDeliveryPackage,
      addToast,
      tc,
      handleDeliveryModalOpenChange,
    ]
  );

  const handleExportDerivation = useCallback(
    (id: string, format: string) => {
      exportMutation.mutate({
        type: "individual",
        derivationId: id,
        format: format as "png" | "jpeg" | "webp",
      });
    },
    [exportMutation]
  );

  const handleDownloadDeliverySource = useCallback(() => {
    if (!selectedDeliverySource) return;
    handleExportDerivation(selectedDeliverySource.id, "png");
  }, [selectedDeliverySource, handleExportDerivation]);

  return {
    deliveryModalOpen,
    selectedDeliverySource,
    handleDeliveryModalOpenChange,
    handleDownloadDerivation,
    handleCreateDeliveryPackage,
    handleConfirmDeliveryPackage,
    handleExportDerivation,
    handleDownloadDeliverySource,
    exportPending: exportMutation.isPending,
    deliveryPackagePending: createDeliveryPackage.isPending,
  };
}
