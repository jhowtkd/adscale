import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { libraryFavoritesQueryKey, pieceFavoriteQueryKey, useLibraryFavorites, usePieceFavorite } from "./use-piece-favorite";

const mocks = vi.hoisted(() => ({ userId: "user-1", fetch: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: mocks.userId } } }) } }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.fetch }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
beforeEach(() => { vi.clearAllMocks(); mocks.userId = "user-1"; });

it("does not reuse another user's favorite or library cache after switching accounts", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(pieceFavoriteQueryKey("work", "output", "user-1"), true);
  client.setQueryData(libraryFavoritesQueryKey("user-1"), [{ id: "private" }]);
  mocks.fetch.mockResolvedValue(response({ favorite: false, items: [] }));
  mocks.userId = "user-2";
  const { result } = renderHook(() => ({ piece: usePieceFavorite("work", "output", true), library: useLibraryFavorites(true) }), { wrapper });
  expect(result.current.piece.isFavorite).toBe(false);
  expect(result.current.library.data).toBeUndefined();
  await waitFor(() => expect(result.current.library.isSuccess).toBe(true));
  expect(result.current.library.data).toEqual([]);
});

it("retries a failed lookup before mutating and surfaces a failed save without changing cache", async () => {
  const { client, wrapper } = setup();
  mocks.fetch.mockResolvedValueOnce(response({}, false));
  const { result } = renderHook(() => usePieceFavorite("work", "output", true), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  mocks.fetch.mockResolvedValueOnce(response({ favorite: false }));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.isError).toBe(false));
  expect(mocks.fetch.mock.calls[1]).toEqual(["/api/creative-work/work/outputs/output/favorite"]);
  mocks.fetch.mockResolvedValueOnce(response({}, false));
  act(() => result.current.toggle());
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("error"));
  expect(client.getQueryData(pieceFavoriteQueryKey("work", "output", "user-1"))).toBe(false);
});

it("updates the personal favorite and invalidates its library after a successful save", async () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  mocks.fetch.mockResolvedValueOnce(response({ favorite: false }));
  const { result } = renderHook(() => usePieceFavorite("work", "output", true), { wrapper });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  mocks.fetch.mockResolvedValueOnce(response({ favorite: true }));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.isFavorite).toBe(true));
  expect(mocks.fetch).toHaveBeenLastCalledWith("/api/creative-work/work/outputs/output/favorite", { method: "PUT" });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryFavoritesQueryKey("user-1") });
});
