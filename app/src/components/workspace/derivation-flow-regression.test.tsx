import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkspaceActionBar from "./WorkspaceActionBar";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${namespace}.${key}:${JSON.stringify(values)}`;
    }
    return `${namespace}.${key}`;
  },
}));

describe("Estilizar regression", () => {
  it("WorkspaceActionBar still exposes independent Estilizar entry", () => {
    const onEstilizar = vi.fn();
    render(<WorkspaceActionBar onDerivar={vi.fn()} onEstilizar={onEstilizar} />);

    const estilizarButton = screen.getByRole("button", { name: /workspace\.actionBar\.estilizar/i });
    fireEvent.click(estilizarButton);

    expect(onEstilizar).toHaveBeenCalledTimes(1);
  });
});
