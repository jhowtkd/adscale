import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativeToolCards } from "./CreativeToolCards";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({
  variations: "Variações", single: "Peça única", format_adaptation: "Adaptar formatos", restyle: "Mudar estilo",
  variationsDescription: "desc", singleDescription: "desc", format_adaptationDescription: "desc", restyleDescription: "desc",
}[key] ?? key) }));

describe("CreativeToolCards", () => {
  it("selects a preset in the same composer without navigation", () => {
    const onSelect = vi.fn();
    render(<CreativeToolCards selected="variations" onSelect={onSelect} />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /peça única/i }));

    expect(onSelect).toHaveBeenCalledWith("single");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
