import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  calibrationRules,
  type CalibrationRule,
  type NewCalibrationRule,
} from "../db/schema";

export async function insertCalibrationRule(
  input: NewCalibrationRule
): Promise<CalibrationRule> {
  const [row] = await db.insert(calibrationRules).values(input).returning();
  return row;
}

export async function updateCalibrationRuleStatus(input: {
  id: string;
  workspaceId: string;
  status: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}): Promise<CalibrationRule | null> {
  const [row] = await db
    .update(calibrationRules)
    .set({
      status: input.status,
      approvedBy: input.approvedBy ?? null,
      approvedAt: input.approvedAt ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(calibrationRules.id, input.id),
        eq(calibrationRules.workspaceId, input.workspaceId)
      )
    )
    .returning();
  return row ?? null;
}

export async function listCalibrationRulesForClientProfile(input: {
  workspaceId: string;
  clientProfileId: string;
  status?: string;
}): Promise<CalibrationRule[]> {
  const conditions = [
    eq(calibrationRules.workspaceId, input.workspaceId),
    eq(calibrationRules.clientProfileId, input.clientProfileId),
  ];

  if (input.status) {
    conditions.push(eq(calibrationRules.status, input.status));
  }

  return db
    .select()
    .from(calibrationRules)
    .where(and(...conditions))
    .orderBy(desc(calibrationRules.updatedAt));
}

export async function listApprovedCalibrationRules(input: {
  workspaceId: string;
  clientProfileId: string;
}): Promise<CalibrationRule[]> {
  return listCalibrationRulesForClientProfile({
    ...input,
    status: "approved",
  });
}

export async function listApprovedCorpusQualityRules(): Promise<CalibrationRule[]> {
  return db
    .select()
    .from(calibrationRules)
    .where(
      and(
        eq(calibrationRules.status, "approved"),
        eq(calibrationRules.category, "corpus_quality")
      )
    )
    .orderBy(desc(calibrationRules.updatedAt));
}

export async function listApprovedCalibrationRulesByCategories(input: {
  workspaceId: string;
  clientProfileId: string;
  categories: string[];
}): Promise<CalibrationRule[]> {
  if (input.categories.length === 0) {
    return [];
  }

  return db
    .select()
    .from(calibrationRules)
    .where(
      and(
        eq(calibrationRules.workspaceId, input.workspaceId),
        eq(calibrationRules.clientProfileId, input.clientProfileId),
        eq(calibrationRules.status, "approved"),
        inArray(calibrationRules.category, input.categories)
      )
    )
    .orderBy(desc(calibrationRules.updatedAt));
}
