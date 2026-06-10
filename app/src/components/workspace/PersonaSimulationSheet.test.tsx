import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PersonaSimulationSheet from "./PersonaSimulationSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "personaAnalysis": "Persona Analysis",
      "personaAnalysisSubtitle": "See how different audiences react",
      "skeptical_buyer": "Skeptical Buyer",
      "warm_lead": "Warm Lead",
      "financial_decision_maker": "Financial Decision Maker",
      "beginner": "Beginner",
      "understands": "Understands",
      "rejects": "Rejects",
      "wants": "Wants",
      "rationale": "Why",
      "yes": "Yes",
      "no": "No",
      "reGenerate": "Generate again",
      "cachedResult": "Cached result",
    };
    return map[key] || key;
  },
}));

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((fn: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    fn({ addToast: vi.fn() })
  ),
}));

const mockUsePersonaSimulation = vi.fn();
const mockUseCreatePersonaSimulation = vi.fn();

vi.mock("@/lib/hooks/use-persona-simulation", () => ({
  usePersonaSimulation: (...args: unknown[]) => mockUsePersonaSimulation(...args),
  useCreatePersonaSimulation: () => mockUseCreatePersonaSimulation(),
}));

const mockResults = {
  skeptical_buyer: {
    understands: "Saves time",
    rejects: "No proof",
    wants: "Free trial",
    wouldClick: false,
    rationale: "Needs proof",
  },
  warm_lead: {
    understands: "50% off",
    rejects: "Hidden fees",
    wants: "Buy now",
    wouldClick: true,
    rationale: "Great offer",
  },
  financial_decision_maker: {
    understands: "ROI in 3mo",
    rejects: "No pricing",
    wants: "Demo",
    wouldClick: true,
    rationale: "Clear ROI",
  },
  beginner: {
    understands: "Easy to use",
    rejects: "Jargon",
    wants: "Tutorial",
    wouldClick: false,
    rationale: "Too complex",
  },
};

function setupQueryMock(overrides: Partial<ReturnType<typeof mockUsePersonaSimulation>> = {}) {
  mockUsePersonaSimulation.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  });
}

function setupMutationMock(overrides: Partial<ReturnType<typeof mockUseCreatePersonaSimulation>> = {}) {
  mockUseCreatePersonaSimulation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  });
}

describe("PersonaSimulationSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupQueryMock();
    setupMutationMock();
  });

  it("renders loading state with skeleton cards", () => {
    setupQueryMock({ isLoading: true });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    expect(screen.getByText("Persona Analysis")).toBeInTheDocument();
    expect(screen.getAllByRole("generic", { name: "" }).length).toBeGreaterThan(0);
  });

  it("renders error state with retry button", () => {
    setupQueryMock({ isError: true });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls refetch when retry is clicked", () => {
    const refetch = vi.fn();
    setupQueryMock({ isError: true, refetch });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders persona cards when data is available", () => {
    setupQueryMock({
      data: {
        simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        results: mockResults,
        cached: false,
      },
    });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    expect(screen.getByText("Skeptical Buyer")).toBeInTheDocument();
    expect(screen.getByText("Warm Lead")).toBeInTheDocument();
    expect(screen.getByText("Financial Decision Maker")).toBeInTheDocument();
    expect(screen.getByText("Beginner")).toBeInTheDocument();

    expect(screen.getByText("Saves time")).toBeInTheDocument();
    expect(screen.getByText("50% off")).toBeInTheDocument();
    expect(screen.getByText("Needs proof")).toBeInTheDocument();
    expect(screen.getByText("Great offer")).toBeInTheDocument();
  });

  it("shows cached badge when result is cached", () => {
    setupQueryMock({
      data: {
        simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        results: mockResults,
        cached: true,
      },
    });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    expect(screen.getByText("Cached result")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    setupQueryMock({
      data: {
        simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        results: mockResults,
      },
    });

    const onClose = vi.fn();
    render(
      <PersonaSimulationSheet
        isOpen
        onClose={onClose}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls create mutation when regenerate is clicked", () => {
    const mutate = vi.fn();
    setupMutationMock({ mutate });
    setupQueryMock({
      data: {
        simulation: { id: "sim-1", sourceType: "derivation", sourceId: "creative-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        results: mockResults,
      },
    });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /generate again/i }));
    expect(mutate).toHaveBeenCalledWith({ sourceType: "derivation", sourceId: "creative-1" });
  });

  it("disables regenerate button while generating", () => {
    setupMutationMock({ isPending: true });

    render(
      <PersonaSimulationSheet
        isOpen
        onClose={vi.fn()}
        sourceType="derivation"
        sourceId="creative-1"
      />
    );

    expect(screen.getByRole("button", { name: /generate again/i })).toBeDisabled();
  });
});
