import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const extractMutate = vi.fn();
const approveMutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("@/lib/hooks/use-brand-training", () => ({
  useExtractVoice: () => ({ mutate: extractMutate, isPending: false }),
  useApproveVoice: () => ({ mutate: approveMutate, isPending: false }),
}));

import { BrandVoiceSection } from "./BrandVoiceSection";

describe("BrandVoiceSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Palco occupancy instead of a heading and a white generate button", () => {
    const { container } = render(<BrandVoiceSection clientProfileId="profile-1" />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("brandTraining.voiceOptional")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "brandTraining.generateVoice" })).toHaveClass(
      "rounded-full",
    );
    expect(container.querySelector("[class*='border-dashed']")).toBeNull();
  });

  it("opens the proposed voice occupancy from the generate chip", () => {
    extractMutate.mockImplementation((_args, { onSuccess }: { onSuccess: (config: unknown) => void }) => {
      onSuccess({
        clientProfileId: "profile-1",
        voiceId: "voice-1",
        displayName: "Voice",
        reviewStatus: "pending_review",
        source: null,
        config: {
          principles: ["direct"],
          positiveSignals: ["warm"],
          negativeSignals: ["hype"],
          authorityAndClaims: [],
          inviteRhythm: [],
          correctButSoulless: [],
        },
      });
    });

    render(<BrandVoiceSection clientProfileId="profile-1" />);
    fireEvent.click(screen.getByRole("button", { name: "brandTraining.generateVoice" }));

    expect(screen.getByRole("status")).toHaveTextContent("pending_review");
    expect(screen.getByLabelText("brandTraining.voice_principles")).toBeVisible();
    expect(screen.getByRole("button", { name: "brandTraining.approveVoice" })).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
  });
});
