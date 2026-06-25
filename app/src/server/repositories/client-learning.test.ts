import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, orderByMock, fromMock, selectMock } = vi.hoisted(() => {
  const whereMock = vi.fn();
  const orderByMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock, orderBy: orderByMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { whereMock, orderByMock, fromMock, selectMock };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
  },
}));

import { listLearningsByClientProfile } from "./client-learning";

describe("client-learning repository profile isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ orderBy: orderByMock });
  });

  it("scopes learnings by clientProfileId and workspaceId", async () => {
    orderByMock.mockResolvedValue([
      { id: "learning-a", clientProfileId: "profile-a", statement: "A" },
    ]);

    const result = await listLearningsByClientProfile("profile-a", "ws-1", {
      status: "approved",
    });

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.clientProfileId).toBe("profile-a");
  });
});
