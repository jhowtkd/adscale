import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let staffAllowed: boolean | undefined;

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns",
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/lib/hooks/use-equipe-staff", () => ({
  useEquipeStaffAccess: () => ({ data: staffAllowed === undefined ? undefined : { allowed: staffAllowed } }),
}));

import EquipeStaffNav from "./EquipeStaffNav";

describe("EquipeStaffNav", () => {
  beforeEach(() => {
    staffAllowed = undefined;
  });

  it("renders nothing while access is unknown", () => {
    const { container } = render(<EquipeStaffNav />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides the console links from non-staff", () => {
    staffAllowed = false;
    const { container } = render(<EquipeStaffNav />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links the consoles for internal staff", () => {
    staffAllowed = true;
    render(<EquipeStaffNav />);
    expect(
      screen.getByRole("link", { name: "navigation.equipeExceptions" }),
    ).toHaveAttribute("href", "/admin/equipe/exceptions");
    expect(
      screen.getByRole("link", { name: "navigation.equipeAccounts" }),
    ).toHaveAttribute("href", "/admin/equipe/accounts");
    expect(
      screen.getByRole("link", { name: "navigation.equipeQuality" }),
    ).toHaveAttribute("href", "/admin/equipe/quality");
  });
});
