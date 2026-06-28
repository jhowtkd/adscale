import type { Page } from "@playwright/test";

export const ITERATION_THREAD_ID = "thread-e2e-iteration";
export const ITERATION_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000010";
export const CREATED_AT = "2026-06-28T12:00:00.000Z";

export const iterationIds = {
  planLineage: "00000000-0000-4000-8000-000000000001",
  official: "00000000-0000-4000-8000-000000000002",
  working: "00000000-0000-4000-8000-000000000003",
  previous: "00000000-0000-4000-8000-000000000004",
  artifact: "00000000-0000-4000-8000-000000000005",
};

function planVersion(
  id: string,
  versionNumber: number,
  status: string,
  feedback: string | null = null
) {
  return {
    id,
    lineageId: iterationIds.planLineage,
    versionNumber,
    sourceVersionId: null,
    status,
    snapshot: {
      type: "plan" as const,
      strategy: "Estratégia E2E",
      angles: ["Ângulo A"],
      hooks: ["Gancho original"],
      ctas: ["Saiba mais"],
      constraints: null,
    },
    provenance: {
      origin: "revision" as const,
      originalArtifactId: iterationIds.artifact,
      sourceVersionId: null,
      messageId: null,
      actionId: null,
      planVersionId: null,
      format: null,
      generationMode: null,
    },
    feedback,
    createdAt: `2026-06-2${versionNumber}T12:00:00.000Z`,
  };
}

export function buildArtifactVersionState() {
  const previous = {
    ...planVersion(iterationIds.previous, 1, "ready", "Primeira direção"),
    previouslyApproved: true,
  };
  const official = planVersion(iterationIds.official, 2, "approved");
  const working = planVersion(iterationIds.working, 3, "ready", "Mais direto");

  return {
    lineages: [
      {
        lineageId: iterationIds.planLineage,
        artifactType: "plan" as const,
        approvedCurrent: official,
        working,
        versions: [previous, official, working],
        pendingProposals: [],
        generationStatus: null,
      },
    ],
  };
}

function iterationThreadDetail() {
  return {
    thread: {
      id: ITERATION_THREAD_ID,
      workspaceId: "workspace-e2e",
      clientProfileId: "client-e2e",
      campaignId: ITERATION_CAMPAIGN_ID,
      name: "Campanha E2E iteração",
      isDefault: false,
      migratedFromThreadId: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    messages: [],
    artifactVersionState: buildArtifactVersionState(),
  };
}

export function buildCompareResponse() {
  return {
    type: "plan" as const,
    headRevision: 4,
    versionA: {
      versionNumber: 2,
      status: "approved",
      createdAt: "2026-06-22T12:00:00.000Z",
      feedback: null,
    },
    versionB: {
      versionNumber: 3,
      status: "ready",
      createdAt: "2026-06-23T12:00:00.000Z",
      feedback: "Mais direto",
    },
    fields: [
      {
        field: "hooks",
        label: "Ganchos",
        changed: true,
        changes: [
          {
            kind: "edit",
            before: "Gancho original",
            after: "Gancho revisado",
            beforeIndex: 0,
            afterIndex: 0,
          },
        ],
      },
    ],
  };
}

export async function mockIterativeCopilotThread(page: Page): Promise<void> {
  await page.route("**/api/assistant/threads?**", async (route) => {
    await route.fulfill({
      json: {
        threads: [
          {
            id: ITERATION_THREAD_ID,
            workspaceId: "workspace-e2e",
            clientProfileId: "client-e2e",
            campaignId: ITERATION_CAMPAIGN_ID,
            name: "Campanha E2E iteração",
            isDefault: false,
            migratedFromThreadId: null,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          },
        ],
      },
    });
  });

  await page.route(
    `**/api/assistant/threads/${ITERATION_THREAD_ID}`,
    async (route) => {
      await route.fulfill({ json: iterationThreadDetail() });
    }
  );

  await page.route(
    `**/api/assistant/threads/${ITERATION_THREAD_ID}/artifact-versions/compare`,
    async (route) => {
      await route.fulfill({ json: buildCompareResponse() });
    }
  );
}
