import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertResult: [] as unknown[],
}));

vi.mock("../db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => state.insertResult),
        })),
      })),
    },
  };
});

vi.mock("./assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

import { getAssistantThreadById } from "./assistant-thread";
import {
  ArtifactIterationTelemetryValidationError,
  insertArtifactIterationTelemetryEvent,
  listArtifactIterationTelemetryEvents,
} from "./artifact-iteration-telemetry";

const mockGetThread = vi.mocked(getAssistantThreadById);

const thread = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
};

const baseEvent = {
  id: "event-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  campaignId: null,
  actionRecordId: null,
  path: "plan_iteration",
  step: "propose",
  eventKey: "proposal_created",
  reasonCode: null,
  metadata: {},
  occurredAt: new Date("2026-06-26T12:00:00Z"),
  createdAt: new Date("2026-06-26T12:00:00Z"),
};

describe("artifact-iteration-telemetry repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("inserts a scoped telemetry event", async () => {
    state.insertResult = [baseEvent];

    const event = await insertArtifactIterationTelemetryEvent({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      path: "plan_iteration",
      step: "propose",
      eventKey: "proposal_created",
      metadata: {},
    });

    expect(event).toEqual(baseEvent);
    expect(mockGetThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("rejects cross-client profile mismatch on insert", async () => {
    await expect(
      insertArtifactIterationTelemetryEvent({
        workspaceId: "ws-1",
        clientProfileId: "other-profile",
        threadId: "thread-1",
        path: "plan_iteration",
        step: "propose",
        eventKey: "proposal_created",
        metadata: {},
      })
    ).rejects.toBeInstanceOf(ArtifactIterationTelemetryValidationError);
  });

  it("lists events filtered by workspace and time window", async () => {
    state.selectResults.push([baseEvent]);

    const events = await listArtifactIterationTelemetryEvents({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      path: "plan_iteration",
      eventKey: "proposal_created",
      from: new Date("2026-06-26T00:00:00Z"),
      to: new Date("2026-06-26T23:59:59Z"),
      limit: 10,
    });

    expect(events).toEqual([baseEvent]);
  });

  it("rejects cross-workspace thread scope on list when thread scoped", async () => {
    mockGetThread.mockResolvedValue(null);

    await expect(
      listArtifactIterationTelemetryEvents({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        threadId: "thread-1",
      })
    ).rejects.toBeInstanceOf(ArtifactIterationTelemetryValidationError);
  });
});
