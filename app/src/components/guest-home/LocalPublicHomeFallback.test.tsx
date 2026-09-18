import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LocalPublicHomeFallback from "./LocalPublicHomeFallback";

describe("LocalPublicHomeFallback", () => {
  it("usa o landmark apontado pelo skip link global, sem recursão para /", () => {
    render(<LocalPublicHomeFallback />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("data-public-home-mode", "fallback");
    expect(
      screen.getByRole("heading", { name: "Seu Estúdio continua por aqui." }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Entrar no Estúdio" }),
    ).toHaveAttribute("href", "/login?callbackUrl=%2F");
  });
});
