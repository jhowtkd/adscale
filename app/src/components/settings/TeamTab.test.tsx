import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock("@/lib/store", () => ({ useAppStore: () => vi.fn() }));

import TeamTab from "./TeamTab";

const members = [
  { id: "m1", userId: "u-owner", name: "Olga Owner", email: "owner@example.com", image: null, role: "owner" },
  { id: "m2", userId: "u-owner2", name: "Otto Owner", email: "owner2@example.com", image: null, role: "owner" },
  { id: "m3", userId: "u-admin", name: "Ana Admin", email: "admin@example.com", image: null, role: "admin" },
  { id: "m4", userId: "u-admin2", name: "Abel Admin", email: "admin2@example.com", image: null, role: "admin" },
  { id: "m5", userId: "u-member", name: "Mia Member", email: "member@example.com", image: null, role: "member" },
];

function renderAs(viewerUserId: string, rows = members) {
  apiFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ members: rows, viewerUserId }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamTab />
    </QueryClientProvider>
  );
}

async function removableEmails(rows = members) {
  await waitFor(() => expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0));
  return [...new Set(rows.map((m) => m.email))].filter((email) =>
    screen
      .getAllByText(email)
      .some((cell) => within(cell.parentElement!.parentElement!).queryByLabelText("team.removeMember") !== null)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamTab remove button", () => {
  it("lets an owner remove everyone but themselves", async () => {
    renderAs("u-owner");
    expect(await removableEmails()).toEqual([
      "owner2@example.com",
      "admin@example.com",
      "admin2@example.com",
      "member@example.com",
    ]);
  });

  it("lets an admin remove only members", async () => {
    renderAs("u-admin");
    expect(await removableEmails()).toEqual(["member@example.com"]);
  });

  it("lets a member remove nobody", async () => {
    renderAs("u-member");
    expect(await removableEmails()).toEqual([]);
  });

  it("uses the highest-precedence role when a user has several membership rows", async () => {
    const rows = [
      ...members,
      { id: "m6", userId: "u-admin", name: "Ana Admin", email: "admin@example.com", image: null, role: "owner" },
      { id: "m7", userId: "u-member", name: "Mia Member", email: "member@example.com", image: null, role: "admin" },
    ];
    renderAs("u-admin2", rows);
    expect(await removableEmails(rows)).toEqual([]);
  });

  it("gives a viewer with an extra owner row the owner's remove buttons", async () => {
    const rows = [
      ...members,
      { id: "m6", userId: "u-member", name: "Mia Member", email: "member@example.com", image: null, role: "owner" },
    ];
    renderAs("u-member", rows);
    expect(await removableEmails(rows)).toEqual([
      "owner@example.com",
      "owner2@example.com",
      "admin@example.com",
      "admin2@example.com",
    ]);
  });
});
