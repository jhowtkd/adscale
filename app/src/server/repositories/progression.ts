import { eq } from "drizzle-orm";
import { db } from "../db";
import { workspaceProgression, type WorkspaceProgression } from "../db/schema";

export async function getWorkspaceProgressionSnapshot(
  workspaceId: string
): Promise<WorkspaceProgression | null> {
  const [row] = await db
    .select()
    .from(workspaceProgression)
    .where(eq(workspaceProgression.workspaceId, workspaceId))
    .limit(1);

  return row ?? null;
}

export async function upsertWorkspaceProgressionSnapshot(input: {
  workspaceId: string;
  levelKey: string;
  completed: WorkspaceProgression["completed"];
  nextAction: WorkspaceProgression["nextAction"];
  progressPercent: number;
  lastCalculatedAt: Date;
}): Promise<WorkspaceProgression> {
  const [row] = await db
    .insert(workspaceProgression)
    .values({
      workspaceId: input.workspaceId,
      levelKey: input.levelKey,
      completed: input.completed,
      nextAction: input.nextAction,
      progressPercent: input.progressPercent,
      lastCalculatedAt: input.lastCalculatedAt,
    })
    .onConflictDoUpdate({
      target: workspaceProgression.workspaceId,
      set: {
        levelKey: input.levelKey,
        completed: input.completed,
        nextAction: input.nextAction,
        progressPercent: input.progressPercent,
        lastCalculatedAt: input.lastCalculatedAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}
