import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BriefingStep from "./BriefingStep";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const t = ((key: string) => `${namespace}.${key}`) as unknown as {
      raw: (key: string) => unknown;
    };
    t.raw = (key: string) => {
      if (key === "objectives") return { awareness: "Awareness", conversion: "Conversion" };
      return {};
    };
    return t;
  },
}));

vi.mock("@/lib/hooks/use-briefing-autosave", () => ({
  useBriefingAutoSave: () => ({
    clearDraft: vi.fn(),
    hasDraft: false,
    isSaving: false,
    lastSavedAt: null,
    restoreDraft: vi.fn(() => null),
  }),
}));

vi.mock("./AutoBriefingSheet", () => ({
  default: () => null,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const baseCampaign = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Summer Push",
  client: "Acme",
  objective: "awareness",
  audience: "SMB owners",
  constraints: "No red",
  notes: "",
  platforms: ["Meta"] as const,
  status: "draft" as const,
  variations: 0,
  creditsUsed: 0,
  lastModified: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("BriefingStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills campaign name and client fields", () => {
    render(
      <BriefingStep campaign={baseCampaign} onContinue={vi.fn()} onSaveDraft={vi.fn()} />,
      { wrapper: Wrapper }
    );

    expect(screen.getByDisplayValue("Summer Push")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("SMB owners")).toBeInTheDocument();
  });

  it("shows validation errors when required fields are empty", () => {
    render(
      <BriefingStep
        campaign={{ ...baseCampaign, name: "", client: "" }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText("briefing.saveContinue"));

    expect(screen.getByText("errors.nameRequired")).toBeInTheDocument();
    expect(screen.getByText("errors.clientRequired")).toBeInTheDocument();
  });

  it("calls onContinue with form data when valid", () => {
    const onContinue = vi.fn();
    render(
      <BriefingStep campaign={baseCampaign} onContinue={onContinue} onSaveDraft={vi.fn()} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText("briefing.saveContinue"));

    expect(onContinue).toHaveBeenCalledWith({
      name: "Summer Push",
      client: "Acme",
      objective: "awareness",
      audience: "SMB owners",
      constraints: "No red",
      notes: "",
    });
  });

  it("expands notes when add notes is clicked", () => {
    render(
      <BriefingStep campaign={baseCampaign} onContinue={vi.fn()} onSaveDraft={vi.fn()} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText(/briefing\.addNotes/));

    expect(screen.getByPlaceholderText("briefing.notesPlaceholder")).toBeInTheDocument();
  });
});
