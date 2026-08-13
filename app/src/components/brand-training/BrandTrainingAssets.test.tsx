import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks -----------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    namespace === "brandTraining" || namespace === "common"
      ? `${namespace}.${key}`
      : key,
}));

vi.mock("@/components/animations/MotionBoundary", () => ({
  m: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  },
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

const useBrandTrainingAssetsMock = vi.fn();
const useUploadBrandTrainingAssetMock = vi.fn();
const useReviewBrandTrainingAssetMock = vi.fn();
vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandTrainingAssets: () => useBrandTrainingAssetsMock(),
  useUploadBrandTrainingAsset: () => useUploadBrandTrainingAssetMock(),
  useReviewBrandTrainingAsset: () => useReviewBrandTrainingAssetMock(),
}));

import { BrandTrainingAssets } from "./BrandTrainingAssets";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const baseAnalysis = {
  description: "Ondas verdes usadas como moldura inferior.",
  visualAttributes: ["green waves", "soft curves"],
  rules: ["Preserve aspect ratio"],
  constraints: ["Do not recolor"],
  confidence: 0.85,
};

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "ref-1",
    clientProfileId: "profile-1",
    assetKey: "workspaces/w/brand-training/ref-1.png",
    label: "Ondas verdes",
    reviewStatus: "pending_approval",
    trainingCategory: "graphic",
    usageMode: "reference",
    trainingAnalysis: baseAnalysis,
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    asset: {
      id: "asset-1",
      key: "workspaces/w/brand-training/ref-1.png",
      type: "image/png",
      metadata: { hasAlpha: true },
    },
    url: "https://cdn.example/ref-1.png",
    ...overrides,
  };
}

describe("BrandTrainingAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandTrainingAssetsMock.mockReturnValue({ data: [], isLoading: false });
    useUploadBrandTrainingAssetMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    useReviewBrandTrainingAssetMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("shows pending approval cards when legacy pending_approval rows exist", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [asset()],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText("Ondas verdes")).toBeVisible();
    expect(
      screen.getAllByText("brandTraining.assets.statusPendingApproval").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "brandTraining.assets.approve" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: "brandTraining.assets.category" }),
    ).toHaveValue("graphic");
    expect(
      screen.getByRole("combobox", { name: "brandTraining.assets.usageMode" }),
    ).toHaveValue("reference");
  });

  it("renders a read-only pending_analysis region with role=status", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [asset({ reviewStatus: "pending_analysis", trainingAnalysis: null })],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    const region = await screen.findByRole("status");
    expect(region).toBeInTheDocument();
    expect(
      screen.getAllByText("brandTraining.assets.statusPendingAnalysis").length,
    ).toBeGreaterThan(0);
  });

  it("renders approved assets as cards with archive action", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [
        asset({
          id: "approved-1",
          reviewStatus: "approved",
          reviewedAt: new Date("2026-07-05T12:00:00Z"),
          reviewedByUserId: "reviewer-1",
        }),
      ],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText("Ondas verdes")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "brandTraining.assets.archive" }),
    ).toBeEnabled();
  });

  it("identifies and confirms a legacy auto-approved asset without removing it", async () => {
    const mutate = vi.fn();
    useReviewBrandTrainingAssetMock.mockReturnValue({ mutate, isPending: false });
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [asset({ id: "legacy-1", reviewStatus: "approved" })],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect((await screen.findAllByText("brandTraining.assets.statusLegacyUnreviewed")).length)
      .toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "brandTraining.assets.confirmLegacy" }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: "legacy-1",
        reviewStatus: "approved",
        analysis: baseAnalysis,
      }),
      expect.any(Object),
    );
  });

  it("renders archived assets without actions", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [
        asset({
          id: "archived-1",
          reviewStatus: "archived",
        }),
      ],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText("Ondas verdes")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "brandTraining.assets.archive" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "brandTraining.assets.approve" }),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when no assets exist", () => {
    useBrandTrainingAssetsMock.mockReturnValue({ data: [], isLoading: false });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByText("brandTraining.assets.emptyTitle"),
    ).toBeInTheDocument();
  });

  it("shows a blocking validation message for exact mode when hasAlpha is false", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [
        asset({
          id: "exact-no-alpha",
          trainingCategory: "logo",
          usageMode: "exact",
          asset: {
            id: "asset-2",
            key: "workspaces/w/brand-training/ref-2.png",
            type: "image/jpeg",
            metadata: { hasAlpha: false },
          },
        }),
      ],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    expect(
      await screen.findByText("brandTraining.assets.transparentRequired"),
    ).toBeVisible();
  });

  it("surfaces upload failure via role=alert", async () => {
    const mutate = vi.fn((_args, { onError }: { onError: (err: Error) => void }) => {
      onError(new Error("invalid_type"));
    });
    useUploadBrandTrainingAssetMock.mockReturnValue({
      mutate,
      isPending: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    const input = document.querySelector<HTMLInputElement>(
      "#brand-training-files",
    );
    expect(input).not.toBeNull();
    // Use an unsupported MIME so the client-side validator rejects it.
    const file = new File([new Uint8Array([0])], "logo.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("brandTraining.assets.uploadFailed");
    // The mutation should not run when the validator rejects the file.
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps keyboard-accessible labels on every interactive field", async () => {
    useBrandTrainingAssetsMock.mockReturnValue({
      data: [asset()],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "brandTraining.assets.category" }),
      ).toBeInTheDocument();
    });
    // Each editable control is reachable by accessible name.
    expect(
      screen.getByRole("combobox", { name: "brandTraining.assets.usageMode" }),
    ).toHaveAccessibleName("brandTraining.assets.usageMode");
    expect(
      screen.getByRole("button", { name: "brandTraining.assets.approve" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "brandTraining.assets.archive" }),
    ).toBeInTheDocument();
  });

  it("calls review mutation with approved status on approve click", async () => {
    const mutate = vi.fn();
    useReviewBrandTrainingAssetMock.mockReturnValue({
      mutate,
      isPending: false,
    });

    useBrandTrainingAssetsMock.mockReturnValue({
      data: [asset({ id: "ref-approve" })],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "brandTraining.assets.approve",
      }),
    );

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "approved" }),
      expect.any(Object),
    );
  });

  it("archives approved assets with analysis: null (no empty description)", async () => {
    const mutate = vi.fn();
    useReviewBrandTrainingAssetMock.mockReturnValue({
      mutate,
      isPending: false,
    });

    useBrandTrainingAssetsMock.mockReturnValue({
      data: [
        asset({
          id: "approved-no-analysis",
          reviewStatus: "approved",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          trainingAnalysis: null,
        }),
      ],
      isLoading: false,
    });

    render(<BrandTrainingAssets clientProfileId="profile-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "brandTraining.assets.archive",
      }),
    );

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: "approved-no-analysis",
        reviewStatus: "archived",
        analysis: null,
      }),
      expect.any(Object),
    );
  });
});
