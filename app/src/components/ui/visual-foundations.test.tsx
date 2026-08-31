import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8"
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key.replace("status.", ""),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/animations/FadeIn", () => ({
  FadeIn: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@/lib/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

describe("visual foundation contract", () => {
  it("foundation test harness loads", () => {
    expect(stylesheet).toContain('@import "tailwindcss"');
  });

  it("tokens, themes, aliases, and semantic states are canonical", () => {
    expect(stylesheet).toContain("--canvas:");
    for (const [alias, token] of [
      ["--deep-bg", "--canvas"],
      ["--border-dim", "--border-subtle"],
      ["--border-medium", "--border-default"],
      ["--ghost", "--text-muted"],
      ["--accent-secondary", "--neutral-text"],
    ]) {
      expect(stylesheet).toContain(`${alias}: var(${token})`);
    }
    for (const alias of ["--accent-green", "--accent-rose", "--accent-mint", "--accent-blue", "--accent-teal", "--accent-purple", "--pale", "--cream", "--ink"]) {
      expect(stylesheet).not.toMatch(new RegExp(`${alias}:`));
    }
    expect(stylesheet).toContain("--status-approved-bg: var(--success-bg)");
  });

  it("keeps success semantics distinct from neutral in both themes", () => {
    const themes = [
      stylesheet.slice(
        stylesheet.indexOf("/* Canonical light theme */"),
        stylesheet.indexOf("/* Light-mode logo"),
      ),
      stylesheet.slice(
        stylesheet.indexOf("/* Canonical dark theme"),
      ),
    ];

    for (const theme of themes) {
      for (const role of ["bg", "border", "text", "dot"]) {
        expect(theme).toMatch(new RegExp(`--success-${role}:\\s*oklch\\(`));
      }
    }
  });

  it("maps active status and decorative emphasis to their neutral semantic roles", () => {
    for (const [token, role] of [
      ["--status-active", "--info-dot"],
      ["--status-active-bg", "--info-bg"],
      ["--status-active-text", "--info-text"],
      ["--status-active-dot", "--info-dot"],
    ]) {
      expect(stylesheet).toContain(`${token}: var(${role})`);
    }

    const pulseGlow = stylesheet.slice(
      stylesheet.indexOf("@keyframes pulse-glow"),
      stylesheet.indexOf("@keyframes shimmer"),
    );
    expect(pulseGlow).toContain("var(--focus-ring)");
    expect(pulseGlow).not.toContain("rgba(0, 232, 94");

    const suggestEmphasis = stylesheet.slice(
      stylesheet.indexOf("@keyframes suggest-emphasis"),
      stylesheet.indexOf("@keyframes spin-slow"),
    );
    expect(suggestEmphasis).toContain("var(--selection-border)");
    expect(suggestEmphasis).not.toContain("var(--accent-green)");
  });

  it("geometry, density, typography, radius, motion, and content width are named", () => {
    for (const token of [
      "--space-1",
      "--control-touch",
      "--text-page",
      "--radius-overlay",
      "--duration-default",
      "--content-workspace",
    ]) {
      expect(stylesheet).toContain(`${token}:`);
    }
  });

  it("layers use one ordered global contract", () => {
    const tokens = [
      "--layer-base",
      "--layer-raised",
      "--layer-sticky",
      "--layer-shell",
      "--layer-shell-floating",
      "--layer-popover",
      "--layer-backdrop",
      "--layer-overlay",
      "--layer-toast",
      "--layer-tour",
      "--layer-skip-link",
    ];
    for (const token of tokens) {
      expect(stylesheet).toContain(`${token}:`);
    }
    const values = tokens.map((token) =>
      Number(stylesheet.match(new RegExp(`${token}:\\s*(\\d+)`))?.[1])
    );
    expect(
      values.every((value, index) => index === 0 || value > values[index - 1])
    ).toBe(true);
  });
});

describe("button primitive", () => {
  it("button renders default, disabled, and aria-invalid states", () => {
    const { rerender } = render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    rerender(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    rerender(<Button aria-invalid="true">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("button preserves variant and size class contracts", () => {
    render(
      <Button variant="outline" size="sm" className="custom-class">
        Compact
      </Button>
    );
    const button = screen.getByRole("button", { name: "Compact" });
    expect(button.className).toContain("custom-class");
    expect(button.className).toContain("rounded-[var(--radius-control)]");
    expect(button.className).toContain("h-[var(--control-sm)]");
  });

  it("button exposes busy state for loading affordance", () => {
    render(<Button aria-busy="true">Loading</Button>);
    expect(screen.getByRole("button", { name: "Loading" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });
});

describe("input and textarea primitives", () => {
  it("input keeps mobile text size and compact desktop density", () => {
    render(<Input placeholder="Email" aria-label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input.className).toContain("text-[length:var(--text-body-lg)]");
    expect(input.className).toContain("md:text-[length:var(--text-body)]");
    expect(input.className).toContain("h-[var(--control-md)]");
  });

  it("input and textarea expose disabled and invalid states", () => {
    const { rerender } = render(
      <Input aria-label="Field" disabled defaultValue="x" />
    );
    expect(screen.getByLabelText("Field")).toBeDisabled();

    rerender(<Textarea aria-label="Notes" aria-invalid="true" />);
    expect(screen.getByLabelText("Notes")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("textarea uses canonical field geometry", () => {
    render(<Textarea aria-label="Brief" />);
    const field = screen.getByLabelText("Brief");
    expect(field.className).toContain("rounded-[var(--radius-control)]");
    expect(field.className).toContain("px-[var(--space-3)]");
  });
});

describe("badge and status primitives", () => {
  it("badge semantic variants expose text and border meaning", () => {
    render(
      <>
        <Badge variant="success">Approved</Badge>
        <Badge variant="warning">Queued</Badge>
        <Badge variant="danger">Failed</Badge>
      </>
    );
    expect(screen.getByText("Approved").className).toContain(
      "text-[var(--success-text)]"
    );
    expect(screen.getByText("Queued").className).toContain(
      "text-[var(--warning-text)]"
    );
    expect(screen.getByText("Failed").className).toContain(
      "text-[var(--danger-text)]"
    );
  });

  it("status badge maps product statuses with visible text", () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByText("approved");
    expect(badge).toHaveTextContent("approved");
    expect(badge).not.toHaveAttribute("aria-label");
    expect(badge.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(badge.className).toContain("bg-[var(--status-approved-bg)]");
  });

  it("status badge falls back to neutral semantics for unknown values", () => {
    render(<StatusBadge status="custom-status" showDot />);
    const badge = screen.getByText("custom-status");
    expect(badge.className).toContain("bg-[var(--neutral-bg)]");
  });
});

describe("table primitive", () => {
  it("table keeps compact density, tabular numbers, and horizontal containment", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Spend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>12345.67</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(
      container.querySelector("[data-slot='table-container']")?.className
    ).toContain("overflow-x-auto");
    expect(container.querySelector("table")?.className).toContain(
      "tabular-nums"
    );
    expect(screen.getByRole("columnheader", { name: "Spend" }).className).toContain(
      "h-[var(--control-lg)]"
    );
  });

  it("table preserves semantic structure for long values", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>
              Very long campaign identifier that should stay inside the scroll container
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell")).toHaveTextContent(
      "Very long campaign identifier"
    );
  });
});

describe("skeleton primitive", () => {
  it("skeleton uses tonal surfaces and shimmer geometry", () => {
    const { container } = render(<Skeleton className="h-4 w-24" data-testid="sk" />);
    const skeleton = container.querySelector("[data-slot='skeleton']");
    expect(skeleton?.className).toContain("bg-[var(--surface-inset)]");
    expect(skeleton?.className).toContain("rounded-[var(--radius-panel)]");
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
  });

  it("loading state proof uses deterministic skeleton blocks", () => {
    render(
      <div aria-busy="true" aria-label="Loading campaigns">
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
    expect(screen.getByLabelText("Loading campaigns")).toBeInTheDocument();
    expect(screen.getAllByRole("generic").length).toBeGreaterThan(0);
  });
});

describe("empty state primitive", () => {
  it("empty state uses tonal structure and canonical button action", () => {
    render(
      <EmptyState
        title="No campaigns"
        description="Create your first campaign to begin."
        action={{ label: "Create campaign", href: "/campaigns?new=1" }}
      />
    );
    expect(screen.getByRole("heading", { name: "No campaigns" })).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Create campaign" });
    expect(action).toHaveAttribute("href", "/campaigns?new=1");
    expect(action.className).toContain("rounded-[var(--radius-control)]");
  });

  it("error state proof composes recoverable empty-state messaging", () => {
    const onRetry = vi.fn();
    render(
      <EmptyState
        title="Unable to load campaigns"
        description="Check your connection and try again."
        action={{ label: "Retry", onClick: onRetry }}
      />
    );
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
