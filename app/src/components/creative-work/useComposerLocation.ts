"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import { COMPOSER_INTENTS, UUID_SCHEMA, type ComposerIntent } from "./composer-state";
import {
  hrefWithSearch,
  searchWithCampaignId,
  searchWithIntent,
  searchWithWorkId,
  searchWithoutConsumedTemplate,
} from "./composer-url";

export function useComposerLocation(input: {
  initialTemplateId?: string;
  workIdRef: MutableRefObject<string | null>;
}) {
  const exposeWorkId = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    const query = searchWithWorkId(window.location.search, id);
    if (!query) return;
    window.history.replaceState(window.history.state, "", hrefWithSearch(window.location.pathname, query));
  }, []);

  const exposeIntent = useCallback((next: ComposerIntent) => {
    if (typeof window === "undefined") return;
    const query = searchWithIntent(window.location.search, next);
    window.history.replaceState(window.history.state, "", hrefWithSearch(window.location.pathname, query));
  }, []);

  const exposeCampaignId = useCallback((campaignId: string | null) => {
    if (typeof window === "undefined") return;
    const query = searchWithCampaignId(window.location.search, campaignId);
    window.history.replaceState(
      window.history.state,
      "",
      hrefWithSearch(window.location.pathname, query || null, window.location.hash),
    );
  }, []);

  const consumedTemplateUrlRef = useRef(false);

  const consumeInitialTemplateParams = useCallback(() => {
    if (typeof window === "undefined" || !input.initialTemplateId || consumedTemplateUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const workIdCandidate = params.get("workId") ?? input.workIdRef.current;
    const intentCandidate = params.get("intent");
    const intent = intentCandidate && COMPOSER_INTENTS.has(intentCandidate as ComposerIntent)
      ? intentCandidate
      : null;
    const query = searchWithoutConsumedTemplate(
      window.location.search,
      input.initialTemplateId,
      workIdCandidate && UUID_SCHEMA.safeParse(workIdCandidate).success ? workIdCandidate : null,
      intent,
    );
    if (query === null) return;
    window.history.replaceState(
      window.history.state,
      "",
      hrefWithSearch(window.location.pathname, query || null, window.location.hash),
    );
    consumedTemplateUrlRef.current = true;
  }, [input.initialTemplateId, input.workIdRef]);

  return { exposeWorkId, exposeIntent, exposeCampaignId, consumeInitialTemplateParams };
}
