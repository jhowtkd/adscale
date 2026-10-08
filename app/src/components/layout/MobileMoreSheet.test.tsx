import { fireEvent, render, screen } from "@testing-library/react";
import { Star } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ideas",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import MobileMoreSheet from "./MobileMoreSheet";

const renderSheet = (props: Partial<React.ComponentProps<typeof MobileMoreSheet>> = {}) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <MobileMoreSheet open onOpenChange={() => {}} {...props} />
    </NextIntlClientProvider>,
  );

describe("MobileMoreSheet", () => {
  it("lists Pipeline, Ideias and Metas by default", () => {
    renderSheet();
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline");
    expect(screen.getByRole("link", { name: "Ideias" })).toHaveAttribute("href", "/ideas");
    expect(screen.getByRole("link", { name: "Metas" })).toHaveAttribute("href", "/goals");
  });

  it("omits Pipeline with omitPipeline and keeps the rest", () => {
    renderSheet({ omitPipeline: true });
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ideias" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ptBR.navigation.config })).toBeInTheDocument();
  });

  it("appends the extra items after Docs and marks the active one", () => {
    renderSheet({ extraItems: [{ href: "/extra", label: "Extra", icon: Star, active: true }] });
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links.at(-1)).toBe("/extra");
    expect(links.indexOf("/docs")).toBeLessThan(links.indexOf("/extra"));
    expect(screen.getByRole("link", { name: "Extra" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the close button's name as it was (the classic shell), and takes a name from the host that has one", () => {
    const { unmount } = renderSheet();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    unmount();
    renderSheet({ closeLabel: "Fechar" });
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("closes when an item is chosen", () => {
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    fireEvent.click(screen.getByRole("link", { name: "Metas" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
