import "server-only";
import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json";
import {
  invalidateCarouselApprovals,
  invalidateCarouselProductionApprovals,
  isMaterialCarouselEditorialMutation,
  mergeCarouselEditorialForClientSettingsWrite as mergeCarouselEditorialApprovalsForClientWrite,
  type CarouselEditorialRevisionPayload,
  type CarouselEditorialState,
  type CarouselHook,
} from "./carousel-editorial-state";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCarouselEditorialContext(context: unknown): string {
  return sha256(canonicalJsonStringify(context));
}

export function hashCarouselEditorialRevision(payload: CarouselEditorialRevisionPayload): string {
  return sha256(canonicalJsonStringify({
    context: payload.context,
    selectedHook: payload.selectedHook,
    deck: payload.deck,
    storyboard: payload.storyboard,
    caption: payload.caption,
  }));
}

export function carouselEditorialContextFromRequest(request: string): { request: string } {
  return { request };
}

export function selectedCarouselHook(state: CarouselEditorialState): CarouselHook | null {
  if (!state.selectedHookId) return null;
  return state.hooks.find((hook) => hook.id === state.selectedHookId) ?? null;
}

export function recomputeCarouselEditorialHashes(
  state: CarouselEditorialState,
  input: { request: string; deck?: unknown },
): CarouselEditorialState {
  const context = carouselEditorialContextFromRequest(input.request);
  return {
    ...state,
    contextHash: hashCarouselEditorialContext(context),
    revision: hashCarouselEditorialRevision({
      context,
      selectedHook: selectedCarouselHook(state),
      deck: input.deck ?? null,
      storyboard: state.storyboard,
      caption: state.caption,
    }),
  };
}

export function withInvalidatedAndRecomputedCarouselEditorial<
  T extends { carouselEditorial?: CarouselEditorialState; carouselDraft?: unknown },
>(settings: T, request: string): T {
  if (!settings.carouselEditorial) return settings;
  return {
    ...settings,
    carouselEditorial: recomputeCarouselEditorialHashes(
      invalidateCarouselApprovals(settings.carouselEditorial),
      { request, deck: settings.carouselDraft ?? null },
    ),
  };
}

export function withInvalidatedProductionAndRecomputedCarouselEditorial<
  T extends { carouselEditorial?: CarouselEditorialState; carouselDraft?: unknown },
>(settings: T, request: string): T {
  if (!settings.carouselEditorial) return settings;
  return {
    ...settings,
    carouselEditorial: recomputeCarouselEditorialHashes(
      invalidateCarouselProductionApprovals(settings.carouselEditorial),
      { request, deck: settings.carouselDraft ?? null },
    ),
  };
}

export function mergeCarouselEditorialForClientSettingsWrite<T extends {
  carouselDraft?: unknown;
  carouselEditorial?: CarouselEditorialState;
}>(input: {
  persistedRequest: string;
  incomingRequest: string;
  persistedSettings: { carouselDraft?: unknown; carouselEditorial?: CarouselEditorialState } | null | undefined;
  incomingSettings: T;
}): T {
  const merged = mergeCarouselEditorialApprovalsForClientWrite(input);
  if (!merged.carouselEditorial) return merged;
  if (!isMaterialCarouselEditorialMutation(input)) return merged;
  return {
    ...merged,
    carouselEditorial: recomputeCarouselEditorialHashes(merged.carouselEditorial, {
      request: input.incomingRequest,
      deck: merged.carouselDraft ?? null,
    }),
  };
}
