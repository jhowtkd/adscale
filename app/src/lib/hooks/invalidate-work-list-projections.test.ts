import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  CANONICAL_WORKS_QUERY_KEY,
  invalidateWorkListProjections,
} from "./use-canonical-works";

describe("invalidateWorkListProjections", () => {
  it("invalidates campaigns, dashboard, and canonical-works", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateWorkListProjections(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: CANONICAL_WORKS_QUERY_KEY });
  });
});
