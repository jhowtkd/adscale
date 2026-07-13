/**
 * Narrow mutation handles for workspace flow modules (Phase 6 / item 48 P2).
 * Derived from real hook return types so the facade needs no `as never` casts.
 */
import type { useCreateDerivations, useRestyleCampaign } from "@/lib/hooks/use-derivations";
import type { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import type { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import type { useReviewDerivation } from "@/lib/hooks/use-review";
import type { useCreativeQa } from "@/lib/hooks/use-creative-qa";
import type { useExport } from "@/lib/hooks/use-export";
import type { useCreateDeliveryPackage } from "@/lib/hooks/use-delivery-package";

type PickMutate<T> = Pick<T, Extract<keyof T, "mutate" | "mutateAsync" | "isPending" | "isError" | "variables">>;

export type CreateDerivationsHandle = PickMutate<ReturnType<typeof useCreateDerivations>>;
export type RestyleCampaignHandle = PickMutate<ReturnType<typeof useRestyleCampaign>>;
export type UpdateCampaignHandle = PickMutate<ReturnType<typeof useUpdateCampaign>>;
export type RegenerateDerivationHandle = PickMutate<ReturnType<typeof useRegenerateDerivation>>;
export type ReviewDerivationHandle = PickMutate<ReturnType<typeof useReviewDerivation>>;
export type CreativeQaHandle = PickMutate<ReturnType<typeof useCreativeQa>>;
export type ExportHandle = PickMutate<ReturnType<typeof useExport>>;
export type DeliveryPackageHandle = PickMutate<ReturnType<typeof useCreateDeliveryPackage>>;
