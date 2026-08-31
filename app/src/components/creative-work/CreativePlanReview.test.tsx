import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativePlanReview } from "./CreativePlanReview";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "pt-BR" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => {
    if (key === "pieces") return `${values?.count} pieces`;
    const labels = {
      en: { "labels.material.reference": "Reference" },
      "pt-BR": { "labels.material.reference": "Referência" },
    };
    return labels[localeState.locale][key as keyof typeof labels.en] ?? key;
  },
}));

const plan = {
  version: 1 as const, workId: "work-1", preparedRevision: "2026-08-30T12:00:00.000Z", protocol: "single" as const,
  materials: [{ sourceId: "s1", label: "Referência", role: "piece_reference" as const, category: null, treatment: "identity_preservation" as const }],
  preserve: ["verified_facts", "brand_requirements"] as const, explore: ["composition"] as const,
  outputs: [{ label: "Peça única", targetFormat: "4:5" as const, directionId: null }], outputCount: 1, formats: ["4:5" as const],
};

describe("CreativePlanReview", () => {
  it("renders the deterministic safe plan and confirms its exact revision", () => {
    const onConfirm = vi.fn();
    const onEdit = vi.fn();
    render(<CreativePlanReview plan={plan} busy={false} onEdit={onEdit} onConfirm={onConfirm} />);
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("Referência · roles.piece_reference · treatment.identity_preservation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    expect(onConfirm).toHaveBeenCalledWith("2026-08-30T12:00:00.000Z");
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("keeps confirmation explicit and keyboard-focusable", () => {
    const onConfirm = vi.fn();
    render(<CreativePlanReview plan={plan} busy={false} onEdit={vi.fn()} onConfirm={onConfirm} />);

    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "title" }));
    screen.getByRole("button", { name: "edit" }).focus();
    expect(screen.getByRole("button", { name: "edit" })).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "confirm" });
    confirm.focus();
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(plan.preparedRevision);
  });

  it("renders the complete configuration without actions when used as a result summary", () => {
    render(<CreativePlanReview plan={plan} busy={false} onEdit={vi.fn()} onConfirm={vi.fn()} readOnly />);

    expect(screen.getByText("Referência · roles.piece_reference · treatment.identity_preservation")).toBeInTheDocument();
    expect(screen.getByText("protocol.single")).toBeInTheDocument();
    expect(screen.getByText("4:5")).toBeInTheDocument();
    const adjustments = screen.getByTestId("plan-review-adjustments");
    expect(adjustments).not.toHaveAttribute("open");
    expect(within(adjustments).getByText("adjustments.title")).toBeVisible();
    expect(screen.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "confirm" })).not.toBeInTheDocument();
  });

  it.each([
    ["en", "Reference"],
    ["pt-BR", "Referência"],
  ] as const)("renders a locale-neutral fallback material in %s", (locale, expected) => {
    localeState.locale = locale;
    render(<CreativePlanReview plan={{ ...plan, materials: [{ ...plan.materials[0], label: undefined, labelKey: "material.reference" }] }} busy={false} onEdit={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText(`${expected} · roles.piece_reference · treatment.identity_preservation`)).toBeInTheDocument();
  });
});
