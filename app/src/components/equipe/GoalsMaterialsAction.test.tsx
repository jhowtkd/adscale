import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MaterialsAction } from "./GoalsMaterialsAction";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string) => key) as ((key: string) => string) & {
      has: () => boolean;
    };
    t.has = () => true;
    return t;
  },
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: () => ({
    data: {
      assets: [
        { id: "asset-1", name: "logo.png", url: "/api/workspace/assets/asset-1/file" },
        { id: "asset-2", name: "foto.jpg", url: "/api/workspace/assets/asset-2/file" },
      ],
      total: 2,
    },
    isLoading: false,
  }),
}));

function renderAction() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MaterialsAction accountId="acc-1" materials={[]} />
    </QueryClientProvider>,
  );
}

describe("MaterialsAction thumbnails", () => {
  it("renders asset thumbnails unoptimized with the raw file URL", () => {
    renderAction();
    for (const [name, url] of [
      ["logo.png", "/api/workspace/assets/asset-1/file"],
      ["foto.jpg", "/api/workspace/assets/asset-2/file"],
    ]) {
      const img = screen.getByRole("img", { name });
      // Authenticated file route: the browser must fetch it with the user
      // cookie, so the src must stay raw — never /_next/image?... (401).
      expect(img).toHaveAttribute("src", url);
      expect(img.getAttribute("src")).not.toContain("/_next/image");
    }
  });
});
