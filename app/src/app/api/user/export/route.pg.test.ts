import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import { campaigns, user, workspaces } from "@/server/db/schema";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));

const url = process.env.DATABASE_URL;
const localTestDb = url && new URL(url).hostname === "localhost"
  && new URL(url).port === "5433" && new URL(url).pathname === "/adscale_test";

(localTestDb ? describe : describe.skip)("user export against isolated PostgreSQL", () => {
  const userId = `export-test-${crypto.randomUUID()}`;
  const workspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  const request = new Request("http://localhost/api/user/export");
  let created = false;

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Export Test", email: `${userId}@example.test` });
    created = true;
    await db.insert(workspaces).values([
      { id: workspaceId, name: "Export workspace", slug: `export-${workspaceId}` },
      { id: otherWorkspaceId, name: "Other workspace", slug: `export-${otherWorkspaceId}` },
    ]);
    await db.insert(campaigns).values(Array.from({ length: 205 }, (_, index) => ({
      workspaceId, name: `Campaign ${index}`,
    })));
    await db.insert(campaigns).values({ workspaceId: otherWorkspaceId, name: "Other workspace campaign" });
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      user: { id: userId }, workspace: { id: workspaceId },
    } as never);
  });

  afterAll(async () => {
    if (!created) return;
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("streams all pages from one snapshot while another connection writes", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await db.insert(campaigns).values({ workspaceId, name: "Inserted after export began" });

    const chunks = [first.value!];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    expect(exported.user).toMatchObject({ id: userId, name: "Export Test" });
    expect(exported.workspace).toMatchObject({ id: workspaceId, name: "Export workspace" });
    expect(exported.campaigns).toHaveLength(205);
    expect(exported.campaigns.map((campaign: { name: string }) => campaign.name))
      .not.toContain("Inserted after export began");
    expect(exported.campaigns.map((campaign: { name: string }) => campaign.name))
      .not.toContain("Other workspace campaign");
    expect(exported.derivations).toEqual([]);
    expect(exported.assets).toEqual([]);
    expect(exported.plans).toEqual([]);
  });
});
