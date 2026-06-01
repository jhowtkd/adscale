import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FormatAdaptationConfigModal from "./FormatAdaptationConfigModal";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

describe("FormatAdaptationConfigModal", () => {
  it("single_format confirm sends exactly one selected format", () => {
    const onConfirm = vi.fn();
    render(
      <FormatAdaptationConfigModal
        open
        intent="single_format"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByLabelText("briefing.targetFormats.portrait.label"));
    fireEvent.click(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({ targetFormats: ["4:5"] });
  });

  it("batch_format confirm sends all selected formats", () => {
    const onConfirm = vi.fn();
    render(
      <FormatAdaptationConfigModal
        open
        intent="batch_format"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByLabelText("briefing.targetFormats.portrait.label"));
    fireEvent.click(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({ targetFormats: ["1:1", "9:16"] });
  });

  it("batch_format cannot deselect the last remaining format", () => {
    const onConfirm = vi.fn();
    render(
      <FormatAdaptationConfigModal
        open
        intent="batch_format"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByLabelText("briefing.targetFormats.portrait.label"));
    fireEvent.click(screen.getByLabelText("briefing.targetFormats.stories.label"));
    fireEvent.click(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({ targetFormats: ["1:1"] });
  });
});
