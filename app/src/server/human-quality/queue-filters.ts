import {
  HUMAN_QUALITY_CORPUS_COHORTS,
  HUMAN_QUALITY_CORPUS_STATUSES,
  HUMAN_QUALITY_SOURCE_LABELS,
  isHumanQualityCorpusCohort,
  isHumanQualityCorpusStatus,
  isHumanQualitySourceLabel,
  type HumanQualityCorpusCohort,
  type HumanQualityCorpusStatus,
  type HumanQualitySourceLabel,
} from "./corpus";

export interface CorpusQueueFilters {
  workspaceId?: string;
  clientProfileId?: string;
  campaignId?: string;
  generationMode?: string;
  format?: string;
  cohort?: HumanQualityCorpusCohort;
  status?: HumanQualityCorpusStatus;
  sourceLabel?: HumanQualitySourceLabel;
  selectedAfter?: Date;
  selectedBefore?: Date;
  cursor?: { selectedAt: Date; id: string };
  limit?: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedCorpusQueueFilters {
  filters: CorpusQueueFilters;
  errors: string[];
}

function parseOptionalDate(value: string | null, field: string, errors: string[]): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${field} must be a valid ISO date`);
    return undefined;
  }
  return parsed;
}

export function parseCorpusQueueFilters(searchParams: URLSearchParams): ParsedCorpusQueueFilters {
  const errors: string[] = [];
  const filters: CorpusQueueFilters = {};

  const workspaceId = searchParams.get("workspaceId");
  if (workspaceId) {
    filters.workspaceId = workspaceId;
  }

  const clientProfileId = searchParams.get("clientProfileId");
  if (clientProfileId) filters.clientProfileId = clientProfileId;

  const campaignId = searchParams.get("campaignId");
  if (campaignId) filters.campaignId = campaignId;

  const generationMode = searchParams.get("generationMode");
  if (generationMode) filters.generationMode = generationMode;

  const format = searchParams.get("format");
  if (format) filters.format = format;

  const cohort = searchParams.get("cohort");
  if (cohort) {
    if (isHumanQualityCorpusCohort(cohort)) {
      filters.cohort = cohort;
    } else {
      errors.push(`cohort must be one of: ${HUMAN_QUALITY_CORPUS_COHORTS.join(", ")}`);
    }
  }

  const status = searchParams.get("status");
  if (status) {
    if (isHumanQualityCorpusStatus(status)) {
      filters.status = status;
    } else {
      errors.push(`status must be one of: ${HUMAN_QUALITY_CORPUS_STATUSES.join(", ")}`);
    }
  } else {
    filters.status = "pending";
  }

  const sourceLabel = searchParams.get("sourceLabel");
  if (sourceLabel) {
    if (isHumanQualitySourceLabel(sourceLabel)) {
      filters.sourceLabel = sourceLabel;
    } else {
      errors.push(`sourceLabel must be one of: ${HUMAN_QUALITY_SOURCE_LABELS.join(", ")}`);
    }
  }

  filters.selectedAfter = parseOptionalDate(searchParams.get("selectedAfter"), "selectedAfter", errors);
  filters.selectedBefore = parseOptionalDate(
    searchParams.get("selectedBefore"),
    "selectedBefore",
    errors
  );

  const limitParam = searchParams.get("limit");
  if (limitParam) {
    const limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push("limit must be an integer between 1 and 100");
    } else {
      filters.limit = limit;
    }
  }

  const cursorSelectedAt = searchParams.get("cursorSelectedAt");
  const cursorId = searchParams.get("cursorId");
  if (cursorSelectedAt || cursorId) {
    if (!cursorSelectedAt || !cursorId) {
      errors.push("cursorSelectedAt and cursorId must be provided together");
    } else {
      const selectedAt = parseOptionalDate(cursorSelectedAt, "cursorSelectedAt", errors);
      if (!UUID_PATTERN.test(cursorId)) {
        errors.push("cursorId must be a valid UUID");
      } else if (selectedAt) {
        filters.cursor = { selectedAt, id: cursorId };
      }
    }
  }

  return { filters, errors };
}
