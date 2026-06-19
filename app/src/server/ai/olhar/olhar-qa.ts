import type {
  CreativeQaCheckStatus,
  CreativeQaChecklist,
  CreativeQaResult,
} from "../creative-qa";
import type { CreativeHardFailure } from "../creative-quality-gate";
import { isExportOnlyFailureCode } from "./art-direction-verdict";
import {
  buildOlharVerdictFromFailures,
  type OlharAxisScore,
  type OlharAxisScores,
  type OlharVerdictPayload,
} from "./dual-verdict";

const MAX_NOTES = 3;
const MAX_NOTE_LENGTH = 120;
const FALLBACK_NOTE = "Needs a quick manual review.";

export interface BuildPassagemOlharVerdictInput {
  hardFailures: CreativeHardFailure[];
  qa: Pick<CreativeQaResult, "checklist" | "issues" | "suggestions">;
  evaluatedAt?: string;
}

function statusToAxisScore(status: CreativeQaCheckStatus): OlharAxisScore {
  if (status === "passed") return 3;
  if (status === "warning") return 2;
  return 0;
}

function minAxisScore(scores: OlharAxisScore[]): OlharAxisScore {
  return Math.min(...scores) as OlharAxisScore;
}

export function deriveOlharAxesFromQaChecklist(
  checklist: CreativeQaChecklist
): OlharAxisScores {
  return {
    figura: minAxisScore([
      statusToAxisScore(checklist.legibility.status),
      statusToAxisScore(checklist.informationPreservation.status),
    ]),
    gestalt: minAxisScore([
      statusToAxisScore(checklist.formatFit.status),
      statusToAxisScore(checklist.briefMatch.status),
    ]),
    voz: minAxisScore([
      statusToAxisScore(checklist.briefMatch.status),
      statusToAxisScore(checklist.creativeRisk.status),
    ]),
    convite: statusToAxisScore(checklist.ctaOffer.status),
  };
}

function truncateNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length <= MAX_NOTE_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_NOTE_LENGTH - 1)}…`;
}

function isUsefulNote(note: string): boolean {
  return note.trim().length > 0 && note.trim() !== FALLBACK_NOTE;
}

function collectWhatWorks(checklist: CreativeQaChecklist): string[] {
  const criteria = [
    "legibility",
    "informationPreservation",
    "briefMatch",
    "formatFit",
    "creativeRisk",
    "ctaOffer",
  ] as const;

  return criteria
    .filter((criterion) => checklist[criterion].status === "passed")
    .map((criterion) => truncateNote(checklist[criterion].note))
    .filter(isUsefulNote)
    .slice(0, MAX_NOTES);
}

function collectWhatBlocks(
  hardFailures: CreativeHardFailure[],
  checklist: CreativeQaChecklist
): string[] {
  const blocks = new Set<string>();

  for (const failure of hardFailures) {
    if (!isExportOnlyFailureCode(failure.code)) {
      blocks.add(truncateNote(failure.message));
    }
  }

  const hasArtDirectionFailureNote = hardFailures.some(
    (failure) => !isExportOnlyFailureCode(failure.code)
  );
  if (
    !hasArtDirectionFailureNote &&
    checklist.creativeRisk.status === "failed" &&
    isUsefulNote(checklist.creativeRisk.note)
  ) {
    blocks.add(truncateNote(checklist.creativeRisk.note));
  }

  return [...blocks].slice(0, MAX_NOTES);
}

function buildDirectionNote(
  suggestions: string[],
  whatBlocks: string[]
): string {
  const suggestion = suggestions.find((item) => item.trim().length > 0)?.trim();
  if (suggestion) {
    return truncateNote(suggestion);
  }
  if (whatBlocks.length > 0) {
    return truncateNote(`Reforçar direção: ${whatBlocks[0]}`);
  }
  return "Revisar figura, gestalt e convite antes de exportar.";
}

function hasArtDirectionSignal(
  hardFailures: CreativeHardFailure[],
  checklist: CreativeQaChecklist
): boolean {
  const artDirectionFailures = hardFailures.filter(
    (failure) => !isExportOnlyFailureCode(failure.code)
  );
  return (
    artDirectionFailures.length > 0 || checklist.creativeRisk.status === "failed"
  );
}

/**
 * Builds a conservative Passagem Olhar verdict from QA and gate evidence.
 * Returns null when only export/compliance failures are present.
 */
export function buildPassagemOlharVerdict(
  input: BuildPassagemOlharVerdictInput
): OlharVerdictPayload | null {
  if (!hasArtDirectionSignal(input.hardFailures, input.qa.checklist)) {
    return null;
  }

  const artDirectionFailures = input.hardFailures.filter(
    (failure) => !isExportOnlyFailureCode(failure.code)
  );
  const whatWorks = collectWhatWorks(input.qa.checklist);
  const whatBlocks = collectWhatBlocks(input.hardFailures, input.qa.checklist);
  const directionNote = buildDirectionNote(input.qa.suggestions, whatBlocks);

  return buildOlharVerdictFromFailures({
    failures: artDirectionFailures,
    axes: deriveOlharAxesFromQaChecklist(input.qa.checklist),
    whatWorks,
    whatBlocks,
    directionNote,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    source: "quality_gate",
  });
}
