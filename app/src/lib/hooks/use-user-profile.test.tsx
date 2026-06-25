import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useUserProfile,
  useUpdateUserProfile,
  useUploadProfileAvatar,
} from "./use-user-profile";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const mockProfile = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  bio: "Designer",
  timezone: "America/New_York",
  avatarUrl: "https://cdn.example.com/avatar.jpg",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("use-user-profile hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches user profile on mount", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProfile),
    } as unknown as Response);

    const { result } = renderHook(() => useUserProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/user/profile");
    expect(result.current.data).toEqual(mockProfile);
  });

  it("throws when profile fetch fails", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "unauthorized" }),
    } as unknown as Response);

    const { result } = renderHook(() => useUserProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("unauthorized");
  });

  it("patches partial profile fields", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockProfile,
          firstName: "Janet",
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useUpdateUserProfile(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ firstName: "Janet" });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Janet" }),
    });
  });

  it("uploads avatar via FormData POST", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          avatarUrl: "https://cdn.example.com/new-avatar.png",
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useUploadProfileAvatar(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(file);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/user/profile/avatar",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      })
    );

    const call = mockApiFetch.mock.calls[0];
    const formData = call[1]?.body as FormData;
    expect(formData.get("file")).toBe(file);
  });
});
