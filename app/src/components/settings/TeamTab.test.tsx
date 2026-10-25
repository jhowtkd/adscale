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

function renderAs(viewerUserId: string) {
  apiFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ members, viewerUserId }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamTab />
    </QueryClientProvider>
  );
}

async function removableEmails() {
  await waitFor(() => expect(screen.getByText("owner@example.com")).toBeInTheDocument());
  return members
    .map((m) => m.email)
    .filter((email) => {
      const row = screen.getByText(email).parentElement!.parentElement!;
      return within(row).queryByLabelText("team.removeMember") !== null;
    });
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
});
