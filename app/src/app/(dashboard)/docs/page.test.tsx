import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

import DocsPage from "./page";

describe("DocsPage", () => {
  it("opens the current user manual", () => {
    DocsPage();

    expect(redirectMock).toHaveBeenCalledWith("/manual/");
    expect(existsSync(resolve(process.cwd(), "public/manual/index.html"))).toBe(true);
  });
});
