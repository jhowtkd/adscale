import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));

import { BrandInspirations } from "./BrandInspirations";

describe("BrandInspirations integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [{
      id: "output-1", source: "approved_work", title: "Matrículas", previewUrl: "/asset.png",
      templateId: null, assetId: "asset-1", suggestedIntent: "variations",
    }], isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("keeps a curated item inert until the separate restyle CTA is chosen", async () => {
    const attach = vi.fn().mockResolvedValue(undefined);
    const before = window.location.href;
    render(<BrandInspirations clientProfileId="brand-1" onAttach={attach} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar inspiração Matrículas" }));
    expect(attach).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar para mudar estilo" }));
    await waitFor(() => expect(attach).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-1", suggestedIntent: "restyle" })));
    expect(window.location.href).toBe(before);
  });
});
