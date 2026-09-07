export type ComposerRevisionWriter = (
  workId: string,
  updatedAt: Date | string | null | undefined,
) => string | null;

export type ComposerRevisionRefresher = (workId: string) => Promise<string | null>;

export type ComposerRevisionState = {
  workRevision: string | null;
  workRevisionWorkId: string | null;
  refreshRequiredWorkId: string | null;
  autosaveUnavailableWorkId: string | null;
};

export const EMPTY_COMPOSER_REVISION: ComposerRevisionState = {
  workRevision: null,
  workRevisionWorkId: null,
  refreshRequiredWorkId: null,
  autosaveUnavailableWorkId: null,
};

export function parseWorkRevision(updatedAt: Date | string | null | undefined): string | null {
  if (!updatedAt) return null;
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function applyCanonicalWorkRevision(
  state: ComposerRevisionState,
  workItemId: string,
  updatedAt: Date | string | null | undefined,
): { revision: string | null; state: ComposerRevisionState } {
  const revision = parseWorkRevision(updatedAt);
  if (!revision) return { revision: null, state };
  return {
    revision,
    state: {
      workRevision: revision,
      workRevisionWorkId: workItemId,
      refreshRequiredWorkId: null,
      autosaveUnavailableWorkId:
        state.autosaveUnavailableWorkId === workItemId ? null : state.autosaveUnavailableWorkId,
    },
  };
}

export function cachedCanonicalWorkRevision(
  state: ComposerRevisionState,
  workItemId: string,
): string | null {
  if (
    state.workRevisionWorkId === workItemId
    && state.refreshRequiredWorkId !== workItemId
    && state.workRevision
  ) {
    return state.workRevision;
  }
  return null;
}

export function markRevisionRefreshRequired(
  state: ComposerRevisionState,
  workItemId: string,
): ComposerRevisionState {
  return {
    ...state,
    workRevision: null,
    workRevisionWorkId: workItemId,
    refreshRequiredWorkId: workItemId,
  };
}
