import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActionCards from "./ActionCards";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("Estilizar regression", () => {
  it("ActionCards still exposes independent Estilizar entry", () => {
    const onEstilizar = vi.fn();
    render(<ActionCards onDerivar={vi.fn()} onEstilizar={onEstilizar} />);

    const estilizarButton = screen.getByRole("button", { name: /Workflow de estilização/i });
    fireEvent.click(estilizarButton);

    expect(onEstilizar).toHaveBeenCalledTimes(1);
  });
});
