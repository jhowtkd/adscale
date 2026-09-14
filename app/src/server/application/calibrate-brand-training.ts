import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db";
import { workspaceAssets } from "../db/schema";
import {
  CALIBRATION_FORMAT,
  calibrationCoverage,
  calibrationCredits,
  calibrationDraftKey,
  freezeCandidate,
  type Candidate,
} from "../brand-training/calibration";
import {
  appendCalibrationRound,
  BrandTrainingSessionError,
  getTrainingSessionById,
  linkCalibrationRoundOutputs,
  requireRoundCapacity,
} from "../repositories/brand-training-sessions";
import { getCreativeWork } from "../repositories/creative-work";
import {
  listBrandKnowledgeClaims,
  resolveEvidenceHashes,
} from "../repositories/brand-knowledge";
import { brandKnowledgeEvidenceKey } from "../brand-knowledge/contracts";
import { compileBrandKnowledgeVersion } from "../brand-knowledge/version-compiler";
import { createIdentitySnapshot } from "../creative-work/identity";
import { prepareCreativeWork } from "./prepare-creative-work";
import { generateCreativeWork } from "./generate-creative-work";

export class BrandCalibrationError extends Error {
  readonly code: "quote_changed" | "credit_blocked" | "invalid_context" | "not_found";

  constructor(
    code: "quote_changed" | "credit_blocked" | "invalid_context" | "not_found",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BrandCalibrationError";
    this.code = code;
  }
}

/**
 * The four factually neutral calibration briefs (plan 01, T2). No offer,
 * role, qualification, date, price or technical claim is ever invented; when
 * there is no factual content the text is explicitly labeled as test copy.
 * Plans 02/03 replace these contexts with the reviewed language/person IDs.
 */
export const CALIBRATION_NEUTRAL_BRIEFS: ReadonlyArray<{ title: string; request: string }> = [
  {
    title: "Calibração — apresentação institucional",
    request:
      "[Texto de teste de calibração] Peça de apresentação institucional da marca: nome, segmento e tom visual. Sem oferta, preço, data ou promessa.",
  },
  {
    title: "Calibração — peça educativa",
    request:
      "[Texto de teste de calibração] Peça educativa genérica sobre o segmento da marca. Sem afirmação técnica, estatística ou certificação.",
  },
  {
    title: "Calibração — convite",
    request:
      "[Texto de teste de calibração] Convite institucional genérico. Sem data, horário, local ou preço.",
  },
  {
    title: "Calibração — variação compositiva",
    request:
      "[Texto de teste de calibração] Variação compositiva da apresentação institucional: mesma mensagem, outra disposição de elementos. Sem oferta ou dados.",
  },
];

/**
 * Builds the frozen candidate from the reviewed claims and the complete
 * server-side identity (plan 01, T3 create). Dates stabilize here, at
 * creation — they are never regenerated on read or activation. Evidence
 * hashes cover the claim evidences plus every identity asset SHA.
 */
export async function buildCalibrationCandidate(input: {
  workspaceId: string;
  profileId: string;
}): Promise<Candidate> {
  const claims = await listBrandKnowledgeClaims(input.workspaceId, input.profileId);
  const hashes = await resolveEvidenceHashes(db, input.workspaceId, input.profileId, claims);
  const approved = claims.filter((claim) => claim.status === "approved");
  const compiled = compileBrandKnowledgeVersion({
    profileId: input.profileId,
    claims: approved,
    evidenceHashes: hashes,
  });
  const { brandKnowledge: _ignored, ...identity } = await createIdentitySnapshot({
    workspaceId: input.workspaceId,
    clientProfileId: input.profileId,
    selectedReferenceIds: [],
    includePublishedBrandKnowledge: false,
  });
  const evidenceHashes: Record<string, string> = {};
  for (const claim of compiled.snapshot.claims) {
    for (const evidence of claim.evidenceRefs) {
      evidenceHashes[brandKnowledgeEvidenceKey(evidence)] = evidence.sourceHash;
    }
  }
  const assetKeys = [...new Set(identity.assets.map((asset) => asset.assetKey))];
  if (assetKeys.length > 0) {
    const rows = await db
      .select({ key: workspaceAssets.key, metadata: workspaceAssets.metadata })
      .from(workspaceAssets)
      .where(
        and(
          eq(workspaceAssets.workspaceId, input.workspaceId),
          inArray(workspaceAssets.key, assetKeys),
        ),
      );
    const shaByKey = new Map(
      rows.map((row) => [
        row.key,
        (row.metadata as { sha256?: unknown } | null)?.sha256,
      ]),
    );
    for (const key of assetKeys) {
      const sha = shaByKey.get(key);
      if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha)) {
        throw new BrandCalibrationError(
          "invalid_context",
          `Identity asset ${key} has no verifiable SHA`,
        );
      }
      evidenceHashes[`asset:${key}`] = sha;
    }
  }
  return freezeCandidate({ knowledge: compiled.snapshot, identity, evidenceHashes });
}

export async function startBrandCalibration(input: {
  workspaceId: string;
  profileId: string;
  sessionId: string;
  userId: string;
  expectedRevision: number;
  acceptedCredits: number;
}): Promise<{ sessionId: string; round: number; workItemIds: [string, string, string, string] }> {
  const session = await getTrainingSessionById(input.workspaceId, input.profileId, input.sessionId);
  if (!session) {
    throw new BrandTrainingSessionError("not_found", "Training session not found");
  }
  if (session.revision !== input.expectedRevision) {
    throw new BrandTrainingSessionError("stale_session", "Session revision changed");
  }
  if (calibrationCredits(CALIBRATION_FORMAT) !== input.acceptedCredits) {
    throw new BrandCalibrationError("quote_changed", "Calibration quote changed");
  }
  const roundNumber = requireRoundCapacity(session.rounds.length, session.extensionCount);
  const [first, second, third, fourth] = CALIBRATION_NEUTRAL_BRIEFS;
  const drafts = [first, second, third, fourth].map((brief, index) => ({
    id: randomUUID(),
    draftKey: calibrationDraftKey(input.sessionId, roundNumber, index),
    title: brief!.title,
    request: brief!.request,
  }));
  const appended = await appendCalibrationRound({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    roundNumber,
    candidate: session.candidate,
    quoteCredits: input.acceptedCredits,
    coverage: calibrationCoverage(session.candidate),
    confirmedBy: input.userId,
    works: drafts as [
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
      { id: string; draftKey: string; title: string; request: string },
    ],
  });

  // Dispatch OUTSIDE the transaction through the canonical services. A slot
  // that already reserved (reentry) is reconciled by its persisted outputs;
  // a credit failure leaves a partial batch that the UI shows explicitly.
  const outputIds: Partial<Record<0 | 1 | 2 | 3, string>> = {};
  let sawCreditBlocked = false;
  let firstFailure: string | null = null;
  for (const [slot, workItemId] of appended.workItemIds.entries()) {
    const slotIndex = slot as 0 | 1 | 2 | 3;
    const calibration = { sessionId: input.sessionId, round: roundNumber, slot: slotIndex };
    try {
      const current = await getCreativeWork(input.workspaceId, workItemId);
      if (!current) {
        firstFailure = firstFailure ?? `slot ${slotIndex}: work went missing after the round was stored`;
        continue;
      }
      const reserved = current.outputs[0];
      if (reserved) {
        outputIds[slotIndex] = reserved.id;
        continue;
      }
      const prepared = await prepareCreativeWork({
        workspaceId: input.workspaceId,
        workItemId,
        calibration,
      });
      if (!prepared.ok) {
        firstFailure = firstFailure ?? `slot ${slotIndex}: ${prepared.error.code}`;
        continue;
      }
      const generated = await generateCreativeWork({
        workspaceId: input.workspaceId,
        workItemId,
        userId: input.userId,
        preparedRevision: new Date(prepared.value.work.updatedAt).toISOString(),
        calibration,
      });
      if (!generated.ok) {
        if (generated.error.code === "credit_blocked") sawCreditBlocked = true;
        firstFailure = firstFailure ?? `slot ${slotIndex}: ${generated.error.code}`;
        continue;
      }
      const output = generated.value.outputs[0];
      if (output) outputIds[slotIndex] = output.id;
    } catch {
      firstFailure = firstFailure ?? `slot ${slotIndex}: dispatch failed`;
    }
  }

  if (Object.keys(outputIds).length > 0) {
    const expectedRevision = appended.session.revision;
    try {
      await linkCalibrationRoundOutputs({
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        expectedRevision,
        round: roundNumber,
        outputIds,
      });
    } catch (error) {
      // A concurrent feedback write won the revision race: retry once with a
      // fresh read instead of clobbering the feedback.
      if (error instanceof BrandTrainingSessionError && error.code === "stale_session") {
        const fresh = await getTrainingSessionById(input.workspaceId, input.profileId, input.sessionId);
        if (fresh) {
          await linkCalibrationRoundOutputs({
            workspaceId: input.workspaceId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            expectedRevision: fresh.revision,
            round: roundNumber,
            outputIds,
          });
        }
      } else {
        throw error;
      }
    }
  }

  if (Object.keys(outputIds).length === 0) {
    if (sawCreditBlocked) throw new BrandCalibrationError("credit_blocked", "Insufficient credits for the calibration batch");
    if (firstFailure) throw new BrandCalibrationError("invalid_context", firstFailure);
  }
  return { sessionId: input.sessionId, round: roundNumber, workItemIds: appended.workItemIds };
}
