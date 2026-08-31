import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativePlanReview } from "./CreativePlanReview";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { count?: number }) => key === "pieces" ? `${values?.count} pieces` : key }));

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
    expect(screen.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "confirm" })).not.toBeInTheDocument();
  });
});
