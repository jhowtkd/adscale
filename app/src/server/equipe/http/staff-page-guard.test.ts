import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("./guards", () => ({
  equipeStaffContext: vi.fn(),
}));

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { equipeStaffContext } from "./guards";
import { requireEquipeStaffPage } from "./staff-page-guard";

const mockHeaders = vi.mocked(headers);
const mockNotFound = vi.mocked(notFound);
const mockStaffContext = vi.mocked(equipeStaffContext);

describe("requireEquipeStaffPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("lets internal staff through with the same helper as the API", async () => {
    mockStaffContext.mockResolvedValue({ staffRows: [{ id: "staff-1" }] } as never);
    await requireEquipeStaffPage();
    expect(mockStaffContext).toHaveBeenCalledTimes(1);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("answers notFound for non-staff", async () => {
    mockStaffContext.mockRejectedValue(new Error("Forbidden"));
    await expect(requireEquipeStaffPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});
