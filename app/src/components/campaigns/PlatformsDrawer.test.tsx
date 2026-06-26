import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlatformsDrawer from "./PlatformsDrawer";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="platforms-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe("PlatformsDrawer", () => {
  const onSave = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
  });

  it("opens with checkboxes for all platform options", () => {
    render(
      <PlatformsDrawer
        open
        onOpenChange={onOpenChange}
        selectedPlatforms={[]}
        onSave={onSave}
      />
    );

    expect(screen.getByTestId("platforms-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("common.platformsDrawer.metaFeed")).toBeInTheDocument();
    expect(screen.getByLabelText("common.platformsDrawer.tiktok")).toBeInTheDocument();
  });

  it("preselects existing platforms when opened", () => {
    render(
      <PlatformsDrawer
        open
        onOpenChange={onOpenChange}
        selectedPlatforms={["Meta Feed", "LinkedIn"]}
        onSave={onSave}
      />
    );

    expect(screen.getByLabelText("common.platformsDrawer.metaFeed")).toBeChecked();
    expect(screen.getByLabelText("common.platformsDrawer.linkedin")).toBeChecked();
    expect(screen.getByLabelText("common.platformsDrawer.tiktok")).not.toBeChecked();
  });

  it("saves selected platforms when save is clicked", async () => {
    render(
      <PlatformsDrawer
        open
        onOpenChange={onOpenChange}
        selectedPlatforms={[]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByLabelText("common.platformsDrawer.googleDisplay"));
    fireEvent.click(screen.getByLabelText("common.platformsDrawer.tiktok"));
    fireEvent.click(screen.getByRole("button", { name: "common.platformsDrawer.save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(["Google Display", "TikTok"]);
    });
  });

  it("disables save until at least one platform is selected", () => {
    render(
      <PlatformsDrawer
        open
        onOpenChange={onOpenChange}
        selectedPlatforms={[]}
        onSave={onSave}
      />
    );

    expect(screen.getByRole("button", { name: "common.platformsDrawer.save" })).toBeDisabled();
  });
});
