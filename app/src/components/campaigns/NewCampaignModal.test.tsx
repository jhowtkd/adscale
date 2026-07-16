import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NewCampaignModal from "./NewCampaignModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({
    data: [
      { id: "profile-1", name: "Acme" },
      { id: "profile-2", name: "Other" },
    ],
  }),
}));

describe("NewCampaignModal", () => {
  it("links an exact client profile match when a template pre-fills the client", () => {
    const onSubmit = vi.fn();
    render(
      <NewCampaignModal
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        initialValues={{ name: "Template campaign", clientName: "Acme" }}
        templateName="Template"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Template campaign",
      client: "Acme",
      clientProfileId: "profile-1",
    });
  });

  it("keeps a custom client unlinked", () => {
    const onSubmit = vi.fn();
    render(
      <NewCampaignModal
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        initialValues={{ name: "Custom campaign", clientName: "New client" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Custom campaign",
      client: "New client",
      clientProfileId: null,
    });
  });
});
