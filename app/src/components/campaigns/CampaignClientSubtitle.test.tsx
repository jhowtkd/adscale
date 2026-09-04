import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampaignClientSubtitle from "./CampaignClientSubtitle";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/animations/MotionBoundary", () => ({
  m: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe("CampaignClientSubtitle", () => {
  it("shows platform list when platformsText is provided", () => {
    render(<CampaignClientSubtitle platformsText="Meta Feed, TikTok" />);

    expect(screen.getByText("Meta Feed, TikTok")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows add-platform CTA when no platforms and handler is provided", () => {
    render(<CampaignClientSubtitle onAddPlatform={vi.fn()} />);

    expect(screen.getByRole("button", { name: "addPlatform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "addPlatform" }).className).toContain("rounded-full");
    expect(screen.queryByText("noPlatformsSet")).not.toBeInTheDocument();
  });

  it("calls onAddPlatform when CTA is clicked", () => {
    const onAddPlatform = vi.fn();

    render(<CampaignClientSubtitle onAddPlatform={onAddPlatform} />);
    fireEvent.click(screen.getByRole("button", { name: "addPlatform" }));

    expect(onAddPlatform).toHaveBeenCalledTimes(1);
  });

  it("falls back to passive text when no platforms and no handler", () => {
    render(<CampaignClientSubtitle />);

    expect(screen.getByText("noPlatformsSet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
