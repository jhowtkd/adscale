import { describe, expect, it } from "vitest";
import {
  PublisherFailedError,
  PublisherUncertainError,
  type CreateContainerInput,
} from "../module/ports";
import { InstagramAuthError } from "./auth";
import { FakeGraph } from "./fake-graph";
import { InstagramPublisher } from "./publisher";

const AUTH = { accessToken: "tok", igUserId: "ig_1" };

function publisherOf(graph: FakeGraph, overrides: Partial<Parameters<typeof make>[0]> = {}) {
  return make({ graph, ...overrides });
}

function make(options: {
  graph: FakeGraph;
  authError?: InstagramAuthError;
  resolveMediaUrl?: (ref: string) => Promise<string>;
}) {
  const { graph } = options;
  return new InstagramPublisher({
    fetchFn: graph.fetch,
    loadAuth: async () => {
      if (options.authError) throw options.authError;
      return AUTH;
    },
    resolveMediaUrl: options.resolveMediaUrl ?? (async (ref) => `https://cdn.test/${ref}.jpg`),
  });
}

const CREATE: CreateContainerInput = {
  workspaceId: "ws",
  accountId: "acc",
  itemId: "item",
  versionHash: "v1",
  caption: "olá",
  mediaRef: "out-1",
};

describe("instagram publisher", () => {
  it("creates and publishes, resolving the media url", async () => {
    const graph = new FakeGraph();
    const seen: string[] = [];
    const publisher = make({
      graph,
      resolveMediaUrl: async (ref) => {
        seen.push(ref);
        return `https://cdn.test/${ref}.jpg`;
      },
    });
    const { containerId } = await publisher.createContainer(CREATE);
    expect(containerId).toBe("container_1");
    const published = await publisher.publishContainer({ ...CREATE, containerId });
    expect(published.externalId).toBe("media_1");
    expect(published.permalink).toContain("instagram.test");
    expect(seen).toEqual(["out-1"]);
  });

  it("publishes without permalink when the link is unreadable", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.get", { status: 500 });
    const published = await publisherOf(graph).publishContainer({ ...CREATE, containerId: "c1" });
    expect(published.externalId).toBe("media_1");
    expect(published.permalink).toBeUndefined();
  });

  it("maps expired auth to connection_expired", async () => {
    const publisher = make({
      graph: new FakeGraph(),
      authError: new InstagramAuthError("expirou", "connection_expired"),
    });
    try {
      await publisher.createContainer(CREATE);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PublisherFailedError);
      expect((error as PublisherFailedError).code).toBe("connection_expired");
    }
  });

  it("maps Meta 190 to expired and permission 200 to revoked", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.create", {
      status: 400,
      body: { error: { message: "Invalid OAuth token", code: 190 } },
    });
    graph.failNext("media.create", {
      status: 403,
      body: { error: { message: "Requires permission", code: 200 } },
    });
    const publisher = publisherOf(graph);
    try {
      await publisher.createContainer(CREATE);
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PublisherFailedError).code).toBe("connection_expired");
    }
    try {
      await publisher.createContainer(CREATE);
      throw new Error("expected failure");
    } catch (error) {
      expect((error as PublisherFailedError).code).toBe("connection_revoked");
    }
  });

  it("maps timeouts to uncertain and other 4xx to failed", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.publish", { throws: new TypeError("fetch failed") });
    graph.failNext("media.publish", {
      status: 400,
      body: { error: { message: "Bad caption", code: 100 } },
    });
    const publisher = publisherOf(graph);
    try {
      await publisher.publishContainer({ ...CREATE, containerId: "c1" });
      throw new Error("expected uncertain");
    } catch (error) {
      expect(error).toBeInstanceOf(PublisherUncertainError);
    }
    try {
      await publisher.publishContainer({ ...CREATE, containerId: "c1" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PublisherFailedError);
      expect((error as PublisherFailedError).code).toBe("publish_failed");
    }
  });

  it("lists recent media for reconcile and deletes for operations", async () => {
    const graph = new FakeGraph();
    graph.media = [
      { id: "media_9", caption: "olá", permalink: "https://instagram.test/p/9", timestamp: "2026-10-05T12:00:00.000Z" },
    ];
    const publisher = publisherOf(graph);
    const rows = await publisher.findRecentMedia({ workspaceId: "ws", accountId: "acc", caption: "olá" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: "media_9", caption: "olá" });
    expect(rows[0]!.takenAt).toBeInstanceOf(Date);
    expect(await publisher.deleteMedia({ workspaceId: "ws", accountId: "acc", externalId: "media_9" })).toEqual({
      deleted: true,
    });
  });
});
