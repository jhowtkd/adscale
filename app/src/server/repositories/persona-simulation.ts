import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { personaSimulations } from "../db/schema";
import type { PersonaSimulation } from "../db/schema";

export interface PersonaResult {
  understands: string;
  rejects: string;
  wants: string;
  wouldClick: boolean;
  rationale: string;
}

export interface PersonaSimulationResults {
  skeptical_buyer: PersonaResult;
  warm_lead: PersonaResult;
  financial_decision_maker: PersonaResult;
  beginner: PersonaResult;
}

export async function createPersonaSimulation(
  workspaceId: string,
  campaignId: string,
  sourceType: "derivation" | "landing_page",
  sourceId: string,
  results: PersonaSimulationResults,
): Promise<PersonaSimulation> {
  const result = await db
    .insert(personaSimulations)
    .values({
      workspaceId,
      campaignId,
      sourceType,
      sourceId,
      status: "completed",
      results: results as unknown as Record<string, unknown>,
      cacheExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      error: null,
    })
    .returning();
  return result[0];
}

export async function getPersonaSimulationBySource(
  workspaceId: string,
  sourceType: string,
  sourceId: string,
): Promise<PersonaSimulation | undefined> {
  const rows = await db
    .select()
    .from(personaSimulations)
    .where(
      and(
        eq(personaSimulations.workspaceId, workspaceId),
        eq(personaSimulations.sourceType, sourceType),
        eq(personaSimulations.sourceId, sourceId)
      )
    );
  return rows[0];
}

export async function updatePersonaSimulation(
  id: string,
  results: PersonaSimulationResults,
): Promise<PersonaSimulation> {
  const result = await db
    .update(personaSimulations)
    .set({
      results: results as unknown as Record<string, unknown>,
      status: "completed",
      cacheExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(personaSimulations.id, id))
    .returning();
  return result[0];
}

export function isCacheValid(simulation: PersonaSimulation): boolean {
  if (simulation.status !== "completed" || !simulation.cacheExpiresAt) {
    return false;
  }
  return new Date(simulation.cacheExpiresAt) > new Date();
}
