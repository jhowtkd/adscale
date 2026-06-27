import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key === "generic" ? "Unknown error" : key)),
}));

describe("POST /guided-flow/select-creative", () => {
  it("rejects the legacy mutation boundary", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("guidedFlowCommandsRequired");
  });
});
