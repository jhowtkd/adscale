import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

describe("dialog overlay primitive", () => {
  it("dialog exposes accessible content on canonical overlay layers", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Confirm export</DialogTitle>
          <DialogDescription>Download the selected package.</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    expect(
      screen.getByRole("dialog", { name: "Confirm export" })
    ).toBeInTheDocument();
    expect(screen.getByText("Download the selected package.")).toBeInTheDocument();

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    const content = document.querySelector("[data-slot='dialog-content']");
    expect(overlay?.className).toContain("z-[var(--layer-backdrop)]");
    expect(content?.className).toContain("z-[var(--layer-overlay)]");
  });

  it("dialog trigger opens content and escape closes it", async () => {

    function Harness() {
      return (
        <Dialog>
          <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Layered dialog</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog", { name: "Layered dialog" })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Layered dialog" })).not.toBeInTheDocument();
    });
  });

  it("dialog focus returns to trigger after escape", async () => {

    render(
      <Dialog>
        <DialogTrigger render={<Button />}>Return focus</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Focus dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const trigger = screen.getByRole("button", { name: "Return focus" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

describe("sheet overlay primitive", () => {
  it("sheet uses backdrop and overlay layer contracts", async () => {
    render(
      <Sheet defaultOpen>
        <SheetContent showCloseButton={false}>
          <SheetTitle>Review package</SheetTitle>
          <SheetDescription>Inspect delivery details.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("dialog", { name: "Review package" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot='sheet-overlay']")?.className).toContain(
      "z-[var(--layer-backdrop)]"
    );
    expect(document.querySelector("[data-slot='sheet-content']")?.className).toContain(
      "z-[var(--layer-overlay)]"
    );
  });
});

describe("dropdown popover primitive", () => {
  it("dropdown opens, supports keyboard dismissal, and uses popover layer", async () => {

    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const item = await screen.findByRole("menuitem", { name: "Archive" });
    expect(item).toBeInTheDocument();

    const positioner = document.querySelector("[data-slot='dropdown-menu-content']");
    expect(positioner?.className).toContain("z-[var(--layer-popover)]");

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
    });
  });
});

describe("select popover primitive", () => {
  it("select opens options and consumes canonical popover styling", async () => {

    render(
      <Select>
        <SelectTrigger aria-label="Status">
          <SelectValue placeholder="Choose status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
    expect(await screen.findByRole("option", { name: "Draft" })).toBeInTheDocument();

    const popup = document.querySelector("[data-slot='select-content']");
    expect(popup?.className).toContain("z-[var(--layer-popover)]");
    expect(popup?.className).toContain("shadow-[var(--shadow-floating)]");
  });
});

describe("tooltip popover primitive", () => {
  it("tooltip renders on hover with popover layer tokens", async () => {

    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<Button />}>Hover me</TooltipTrigger>
          <TooltipContent>Layered tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Hover me" }));
    const tooltip = await screen.findByText("Layered tooltip");
    expect(tooltip.getAttribute("data-slot")).toBe("tooltip-content");
    expect(tooltip.className).toContain("z-[var(--layer-popover)]");
  });
});
