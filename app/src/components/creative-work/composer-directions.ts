import {
  createDefaultCreativeDirectionPool,
  type CreativeDirection,
  type CreativeDirectionPool,
} from "@/server/creative-work/contracts";

const MAX_DIRECTION_CHIPS = 5;

export function toggleDirectionSelection(
  current: CreativeDirectionPool,
  directionId: string,
): CreativeDirectionPool | null {
  const selectedIds = current.selectedIds.includes(directionId)
    ? current.selectedIds.filter((id) => id !== directionId)
    : current.selectedIds.length < MAX_DIRECTION_CHIPS
      ? [...current.selectedIds, directionId]
      : current.selectedIds;
  if (selectedIds.length === 0 || selectedIds === current.selectedIds) return null;
  return { ...current, selectedIds };
}

export function withManualDirectionInstruction(
  current: CreativeDirectionPool,
  manualInstruction: string,
): CreativeDirectionPool {
  return { ...current, manualInstruction: manualInstruction || null };
}

export function applySuggestedDirections(
  current: CreativeDirectionPool | null,
  suggestions: CreativeDirection[],
  preserveSelection: boolean,
): CreativeDirectionPool | null {
  if (suggestions.length === 0) return null;
  // #129: "Sugerir novamente" keeps selected chips and fills the rest up to five.
  const keptDirections = preserveSelection && current
    ? current.directions.filter((direction) => current.selectedIds.includes(direction.id))
    : [];
  const directions = [...keptDirections];
  for (const suggestion of suggestions) {
    if (directions.length >= MAX_DIRECTION_CHIPS) break;
    if (!directions.some((direction) => direction.id === suggestion.id)) directions.push(suggestion);
  }
  if (directions.length === 0) return null;
  return {
    version: 1,
    directions,
    selectedIds: keptDirections.length > 0
      ? keptDirections.map((direction) => direction.id)
      : directions.slice(0, 3).map((direction) => direction.id),
    manualInstruction: current?.manualInstruction ?? null,
  };
}

export function currentDirectionPool(
  pool: CreativeDirectionPool | null,
): CreativeDirectionPool {
  return pool ?? createDefaultCreativeDirectionPool();
}

export function shouldFetchDirectionSuggestions(input: {
  intent: string;
  workId: string | null;
  hasReadySource: boolean;
  workStatus: string | undefined;
  retryToken: number;
  hasPersistedAiSuggestions: boolean;
  alreadyRequestedForWorkId: string | null;
}): boolean {
  if (input.intent !== "variations" || !input.workId || !input.hasReadySource) return false;
  if (input.workStatus && input.workStatus !== "draft") return false;
  if (input.retryToken === 0 && input.hasPersistedAiSuggestions) return false;
  return input.alreadyRequestedForWorkId !== input.workId;
}
