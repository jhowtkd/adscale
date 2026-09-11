import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProtocolRadios, protocolRadioClass, protocolShineFill } from "./ProtocolRadios";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ProtocolRadios", () => {
  it("renders protocols as an occupancy switcher, not a segmented track", () => {
    expect(protocolRadioClass(true)).toContain("text-[#0a0a0a]");
    expect(protocolRadioClass(true)).toContain("rounded-full");
    expect(protocolRadioClass(true)).not.toContain("bg-white/14");
    expect(protocolRadioClass(true)).not.toContain("border-");
    expect(protocolShineFill.backgroundImage).toMatch(/#A07CFE/i);

    const onSelect = vi.fn();
    render(<ProtocolRadios selected="variations" onSelect={onSelect} />);

    const group = screen.getByRole("radiogroup");
    expect(group.className).toMatch(/(?:^|\s)flex(?:\s|$)/);
    expect(group.className).toContain("flex-nowrap");
    expect(group.className).toContain("min-h-8");
    expect(group.className).toContain("py-1");
    expect(group.className).not.toContain("inline-flex");
    expect(group.className).not.toContain("-ml-3");
    expect(group.className).not.toContain("border-white/15");
    expect(group.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    const selected = screen.getByRole("radio", { name: "variations" });
    expect(selected.className).toContain("inline-flex");
    expect(selected.className).toContain("items-center");
    expect(selected.getAttribute("style") ?? "").toMatch(/linear-gradient/i);
    expect(selected.className).toContain("text-[#0a0a0a]");
    fireEvent.click(screen.getByRole("radio", { name: "single" }));
    expect(onSelect).toHaveBeenCalledWith("single");
  });
});
