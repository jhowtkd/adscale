import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

import { BrandPeopleReview } from "./BrandPeopleReview";
import type { BrandPerson } from "@/server/brand-training/people";

const ana: BrandPerson = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ana",
  aliases: ["Aninha"],
  referenceIds: ["22222222-2222-4222-8222-222222222222"],
  primaryReferenceId: "22222222-2222-4222-8222-222222222222",
  preserve: ["formato do rosto"],
  referenceAdequacy: "confirmed",
};

describe("BrandPeopleReview", () => {
  it("renders names, photos and the primary reference", () => {
    render(
      <BrandPeopleReview
        value={[ana]}
        onChange={() => {}}
        previewByReferenceId={{ "22222222-2222-4222-8222-222222222222": "https://img/ana.jpg" }}
      />,
    );
    expect(screen.getByTestId("brand-people-review")).toBeDefined();
    expect(screen.getByDisplayValue("Ana")).toBeDefined();
    expect(screen.getByAltText("Ana")).toBeDefined();
    expect(screen.getByText("brandTraining.people.primary")).toBeDefined();
  });

  it("warns about homonyms instead of merging them", () => {
    const twin: BrandPerson = {
      ...ana,
      id: "33333333-3333-4333-8333-333333333333",
      name: "ana",
      referenceIds: ["44444444-4444-4444-8444-444444444444"],
      primaryReferenceId: "44444444-4444-4444-8444-444444444444",
    };
    render(<BrandPeopleReview value={[ana, twin]} onChange={() => {}} previewByReferenceId={{}} />);
    expect(screen.getAllByRole("alert").length).toBe(2);
  });

  it("emits name, adequacy and grouping changes through onChange", () => {
    const onChange = vi.fn();
    render(<BrandPeopleReview value={[ana]} onChange={onChange} previewByReferenceId={{}} />);
    fireEvent.change(screen.getByDisplayValue("Ana"), { target: { value: "Ana Beatriz" } });
    expect(onChange).toHaveBeenCalledWith([{ ...ana, name: "Ana Beatriz" }]);
    fireEvent.click(screen.getByText("brandTraining.people.removePhoto"));
    expect(onChange).toHaveBeenCalledWith([{ ...ana, referenceIds: [] }]);
  });

  it("adds a new person draft awaiting photos", () => {
    const onChange = vi.fn();
    render(<BrandPeopleReview value={[]} onChange={onChange} previewByReferenceId={{}} />);
    fireEvent.change(screen.getByLabelText("brandTraining.people.newName"), { target: { value: "Bia" } });
    fireEvent.click(screen.getByText("brandTraining.people.add"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [BrandPerson[]];
    expect(next[0]?.name).toBe("Bia");
    expect(next[0]?.referenceAdequacy).toBe("needs_more_photos");
  });
});
