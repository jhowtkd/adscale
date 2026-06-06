import type {
  ProgressionEvidenceKey,
  WorkspaceProgressionResponse,
} from "@/lib/progression/types";
import {
  buildEvidenceHref,
  inferWorkspaceEvidence,
} from "./evidence";
import {
  buildNextAction,
  calculateLevel,
  calculateProgressPercent,
  EVIDENCE_ORDER,
  getLevelDefinition,
} from "./levels";
import {
  getWorkspaceProgressionSnapshot,
  upsertWorkspaceProgressionSnapshot,
} from "../repositories/progression";

export async function getWorkspaceProgression(
  workspaceId: string
): Promise<WorkspaceProgressionResponse> {
  const context = await inferWorkspaceEvidence(workspaceId);
  const completed = context.evidence.map((item) => ({
    key: item.key,
    label: item.label,
    completedAt: item.completedAt.toISOString(),
    evidenceId: item.evidenceId,
    evidenceType: item.evidenceType,
  }));

  const completedKeys = new Set<ProgressionEvidenceKey>(
    completed.map((item) => item.key)
  );

  const hrefOverrides = Object.fromEntries(
    EVIDENCE_ORDER.map((key) => [key, buildEvidenceHref(key, context)])
  ) as Partial<Record<ProgressionEvidenceKey, string>>;

  const levelKey = calculateLevel(completedKeys);
  const level = getLevelDefinition(levelKey);
  const progressPercent = calculateProgressPercent(completedKeys);
  const nextAction = buildNextAction(completedKeys, hrefOverrides);
  const lastCalculatedAt = new Date();

  await upsertWorkspaceProgressionSnapshot({
    workspaceId,
    levelKey,
    completed,
    nextAction,
    progressPercent,
    lastCalculatedAt,
  });

  return {
    level: {
      key: level.key,
      label: level.label,
      shortLabel: level.shortLabel,
      description: level.description,
    },
    progressPercent,
    completed,
    nextAction,
    lastCalculatedAt: lastCalculatedAt.toISOString(),
  };
}

export async function getCachedWorkspaceProgression(
  workspaceId: string
): Promise<WorkspaceProgressionResponse | null> {
  const snapshot = await getWorkspaceProgressionSnapshot(workspaceId);
  if (!snapshot) return null;

  const level = getLevelDefinition(snapshot.levelKey as WorkspaceProgressionResponse["level"]["key"]);

  return {
    level: {
      key: level.key,
      label: level.label,
      shortLabel: level.shortLabel,
      description: level.description,
    },
    progressPercent: snapshot.progressPercent,
    completed: (snapshot.completed ?? []).map((item) => ({
      key: item.key as ProgressionEvidenceKey,
      label: item.label,
      completedAt: item.completedAt,
      evidenceId: item.evidenceId,
      evidenceType: item.evidenceType,
    })),
    nextAction: {
      key: snapshot.nextAction.key as ProgressionEvidenceKey,
      label: snapshot.nextAction.label,
      description: snapshot.nextAction.description,
      href: snapshot.nextAction.href,
      blocked: snapshot.nextAction.blocked,
      blockedReason: snapshot.nextAction.blockedReason,
    },
    lastCalculatedAt: (snapshot.lastCalculatedAt ?? snapshot.updatedAt).toISOString(),
  };
}
