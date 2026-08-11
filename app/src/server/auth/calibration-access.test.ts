import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  getSessionFromHeaders: vi.fn(),
}));
vi.mock("./platform-owner", () => ({
  isPlatformOwnerEmail: vi.fn(),
}));
vi.mock("../repositories/workspace", () => ({
  getWorkspaceForUser: vi.fn(),
}));
vi.mock("./workspace", () => ({
  AUTH_ERROR_CODES: { unauthorized: "unauthorized", forbidden: "forbidden" },
  WorkspaceAuthError: class WorkspaceAuthError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  },
  requireRole: vi.fn(),
}));

import { getSessionFromHeaders } from "./session";
import { isPlatformOwnerEmail } from "./platform-owner";
import { getWorkspaceForUser } from "../repositories/workspace";
import { requireRole } from "./workspace";
import { requireCalibrationAccess } from "./calibration-access";

const mockSession = vi.mocked(getSessionFromHeaders);
const mockIsPlatformOwner = vi.mocked(isPlatformOwnerEmail);
const mockGetWorkspace = vi.mocked(getWorkspaceForUser);
const mockRequireRole = vi.mocked(requireRole);

describe("requireCalibrationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com" },
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockIsPlatformOwner.mockReturnValue(false);
    mockGetWorkspace.mockResolvedValue({ id: "workspace-1" } as Awaited<ReturnType<typeof getWorkspaceForUser>>);
    mockRequireRole.mockResolvedValue({ role: "admin" });
  });

  it("rejects workspace owners and admins", async () => {
    await expect(
      requireCalibrationAccess(new Request("http://localhost"), "workspace-1")
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(mockGetWorkspace).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("allows only the configured platform owner", async () => {
    mockIsPlatformOwner.mockReturnValue(true);

    await expect(
      requireCalibrationAccess(new Request("http://localhost"), "workspace-1")
    ).resolves.toMatchObject({
      scope: "platform-owner",
      user: { id: "admin-1" },
    });
    expect(mockGetWorkspace).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
  });
});
