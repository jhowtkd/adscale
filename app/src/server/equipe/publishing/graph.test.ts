import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    EQUIPE_IG_APP_ID: "app-1",
    EQUIPE_IG_APP_SECRET: "shh",
  },
}));

import { FakeGraph } from "./fake-graph";
import { InstagramGraphClient, InstagramGraphError } from "./graph";

function client(graph: FakeGraph): InstagramGraphClient {
  return new InstagramGraphClient({ fetchFn: graph.fetch });
}

async function fails(promise: Promise<unknown>): Promise<InstagramGraphError> {
  try {
    await promise;
  } catch (error) {
    return error as InstagramGraphError;
  }
  throw new Error("expected the Graph call to fail");
}

describe("instagram graph client", () => {
  it("exchanges the code and resolves the IG account", async () => {
    const graph = new FakeGraph();
    const c = client(graph);
    const { accessToken } = await c.exchangeCode("code-1", "https://app.example/cb");
    expect(accessToken).toBe("short-lived-token");
    const long = await c.exchangeLongLivedToken(accessToken);
    expect(long.accessToken).toBe("long-lived-token");
    expect(await c.resolveInstagramAccount(long.accessToken)).toEqual({
      igUserId: "ig_1",
      igUsername: "marca",
    });
  });

  it("returns null when no professional account is linked", async () => {
    const graph = new FakeGraph();
    graph.pages = [{ id: "page_1" }];
    expect(await client(graph).resolveInstagramAccount("tok")).toBeNull();
  });

  it("publishes in two steps, sending caption and image url", async () => {
    const graph = new FakeGraph();
    const c = client(graph);
    const { containerId } = await c.createImageContainer("tok", "ig_1", {
      imageUrl: "https://cdn.test/p1.jpg",
      caption: "olá",
    });
    expect(containerId).toBe("container_1");
    const { mediaId } = await c.publishContainer("tok", "ig_1", containerId);
    expect(mediaId).toBe("media_1");
    expect(graph.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /ig_1/media",
      "POST /ig_1/media_publish",
    ]);
    expect(graph.requests[0]!.params).toMatchObject({
      image_url: "https://cdn.test/p1.jpg",
      caption: "olá",
    });
    expect(graph.requests[1]!.params).toMatchObject({ creation_id: "container_1" });
  });

  it("lists recent media and reads the permalink", async () => {
    const graph = new FakeGraph();
    const c = client(graph);
    const { containerId } = await c.createImageContainer("tok", "ig_1", {
      imageUrl: "https://cdn.test/p1.jpg",
      caption: "olá",
    });
    await c.publishContainer("tok", "ig_1", containerId);
    const rows = await c.listRecentMedia("tok", "ig_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "media_1", caption: "olá" });
    expect(await c.getPermalink("tok", "media_1")).toBe("https://instagram.test/p/media_1");
  });

  it("4xx is definitive and carries the Meta message", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.create", {
      status: 400,
      body: { error: { message: "Invalid image URL", code: 100 } },
    });
    const error = await fails(
      client(graph).createImageContainer("tok", "ig_1", { imageUrl: "x", caption: "y" }),
    );
    expect(error).toBeInstanceOf(InstagramGraphError);
    expect(error.uncertain).toBe(false);
    expect(error.message).toContain("Invalid image URL");
    expect(error.status).toBe(400);
  });

  it("5xx, 429 and network failures are uncertain", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.publish", { status: 500 });
    graph.failNext("media.publish", { status: 429 });
    graph.failNext("media.publish", { throws: new TypeError("fetch failed") });
    const c = client(graph);
    expect((await fails(c.publishContainer("tok", "ig_1", "container_1"))).uncertain).toBe(true);
    expect((await fails(c.publishContainer("tok", "ig_1", "container_1"))).uncertain).toBe(true);
    expect((await fails(c.publishContainer("tok", "ig_1", "container_1"))).uncertain).toBe(true);
  });

  it("a create without id is uncertain", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.create", { status: 200, body: {} });
    const error = await fails(
      client(graph).createImageContainer("tok", "ig_1", { imageUrl: "x", caption: "y" }),
    );
    expect(error.uncertain).toBe(true);
  });

  it("deletes, and 404 counts as deleted", async () => {
    const graph = new FakeGraph();
    const c = client(graph);
    expect(await c.deleteMedia("tok", "media_1")).toEqual({ deleted: true });
    graph.failNext("media.delete", { status: 404 });
    expect(await c.deleteMedia("tok", "media_gone")).toEqual({ deleted: true });
  });

  it("permalink failure degrades to null", async () => {
    const graph = new FakeGraph();
    graph.failNext("media.get", { status: 500 });
    expect(await client(graph).getPermalink("tok", "media_1")).toBeNull();
  });
});
