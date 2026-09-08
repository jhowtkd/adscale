"use client";

import { useCallback, useRef } from "react";
import {
  applyCanonicalWorkRevision,
  markRevisionRefreshRequired,
  resolveObservedCanonicalRevision,
  type ComposerRevisionState,
} from "./composer-revision";

type WorkRevisionRow = {
  id: string;
  updatedAt: Date | string | null;
};

type WorkRevisionQuery = {
  data?: { work?: WorkRevisionRow | null } | null;
  refetch?: () => Promise<{ data?: { work?: WorkRevisionRow | null } | null }>;
};

export function useComposerRevision(detailQuery: WorkRevisionQuery) {
  const workRevisionRef = useRef<string | null>(null);
  const workRevisionWorkIdRef = useRef<string | null>(null);
  const workRevisionRefreshRequiredRef = useRef<string | null>(null);
  const autosaveRevisionUnavailableRef = useRef<string | null>(null);

  const readRevisionState = useCallback((): ComposerRevisionState => ({
    workRevision: workRevisionRef.current,
    workRevisionWorkId: workRevisionWorkIdRef.current,
    refreshRequiredWorkId: workRevisionRefreshRequiredRef.current,
    autosaveUnavailableWorkId: autosaveRevisionUnavailableRef.current,
  }), []);

  const writeRevisionState = useCallback((state: ComposerRevisionState) => {
    workRevisionRef.current = state.workRevision;
    workRevisionWorkIdRef.current = state.workRevisionWorkId;
    workRevisionRefreshRequiredRef.current = state.refreshRequiredWorkId;
    autosaveRevisionUnavailableRef.current = state.autosaveUnavailableWorkId;
  }, []);

  const setCanonicalWorkRevision = useCallback((workItemId: string, updatedAt: Date | string | null | undefined) => {
    const next = applyCanonicalWorkRevision(readRevisionState(), workItemId, updatedAt);
    writeRevisionState(next.state);
    return next.revision;
  }, [readRevisionState, writeRevisionState]);

  const refreshCanonicalWorkRevision = useCallback(async (workItemId: string) => {
    if (!detailQuery.refetch) return null;
    const refreshed = await detailQuery.refetch();
    const work = refreshed.data?.work;
    if (!work || work.id !== workItemId) return null;
    return setCanonicalWorkRevision(workItemId, work.updatedAt);
  }, [detailQuery, setCanonicalWorkRevision]);

  const resolveCanonicalWorkRevision = useCallback(async (workItemId: string) => {
    const work = detailQuery.data?.work;
    const resolved = resolveObservedCanonicalRevision(
      readRevisionState(),
      workItemId,
      work?.id === workItemId ? work.updatedAt : undefined,
    );
    writeRevisionState(resolved.state);
    if (resolved.revision) return resolved.revision;
    return refreshCanonicalWorkRevision(workItemId);
  }, [detailQuery.data?.work, readRevisionState, refreshCanonicalWorkRevision, writeRevisionState]);

  const blockStaleRevision = useCallback((workItemId: string) => {
    writeRevisionState(markRevisionRefreshRequired(readRevisionState(), workItemId));
  }, [readRevisionState, writeRevisionState]);

  const markRevisionUnavailable = useCallback((workItemId: string) => {
    writeRevisionState({
      ...readRevisionState(),
      autosaveUnavailableWorkId: workItemId,
    });
  }, [readRevisionState, writeRevisionState]);

  const isRevisionUnavailable = useCallback((workItemId: string) => {
    return autosaveRevisionUnavailableRef.current === workItemId;
  }, []);

  return {
    setCanonicalWorkRevision,
    refreshCanonicalWorkRevision,
    resolveCanonicalWorkRevision,
    blockStaleRevision,
    markRevisionUnavailable,
    isRevisionUnavailable,
  };
}
