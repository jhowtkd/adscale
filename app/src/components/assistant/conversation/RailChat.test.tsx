import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
let query = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ replace }),
}));
type Context = { accountId: string | null; clientProfileId: string | null; accountStatus: string | null; isPrimary: boolean | null };
let context: Context;
vi.mock("@/lib/equipe/use-conversation-context", () => ({ useConversationContext: () => context }));
let freePlan: { accountId: string | null } | null | undefined;
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
let threadMessages: Array<{ type: string; payload: Record<string, unknown> }> | undefined;
vi.mock("@/lib/hooks/use-assistant-threads", () => ({ useAssistantThread: () => ({ data: threadMessages ? { messages: threadMessages } : undefined }) }));

const coreProps = vi.fn();
vi.mock("@/components/assistant/AssistantChatCore", () => ({
  default: (props: Record<string, unknown>) => {
    coreProps(props);
    return <div data-testid="core">{props.mesa as React.ReactNode}{props.readOnlyFooter as React.ReactNode}</div>;
  },
}));
vi.mock("@/components/billing/FreePlanCta", () => ({
  ClosedAccountRequest: ({ accountId }: { accountId: string }) => <p>closed:{accountId}</p>,
}));
const mesaProps = vi.fn();
vi.mock("@/components/assistant/mesa/ConversationMesa", () => ({
  default: (props: Record<string, unknown>) => {
    mesaProps(props);
    return <div data-testid="conversation-mesa" />;
  },
}));

import RailChat from "./RailChat";

const lastCore = () => coreProps.mock.calls.at(-1)![0] as Record<string, unknown>;
const PHRASE = "O que falta na minha Biblioteca?";

describe("RailChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/";
    query = "";
    threadMessages = [{ type: "assistant", payload: {} }];
    freePlan = { accountId: "acc-1" };
    context = { accountId: "acc-1", clientProfileId: "profile-1", accountStatus: "free", isPrimary: true };
  });

  it("renders the chat of the thread in the rail chrome with the pilot's equipe flow on", () => {
    render(<RailChat threadId="thread-1" />);
    expect(lastCore()).toMatchObject({ threadId: "thread-1", chrome: "rail", equipeEnabled: true, variant: "full" });
  });

  it("puts the mesa on the main conversation, fed with the account, the brand and the messages", () => {
    render(<RailChat threadId="thread-1" />);
    expect(screen.getByTestId("conversation-mesa")).toBeInTheDocument();
    expect(mesaProps).toHaveBeenCalledWith({ accountId: "acc-1", clientProfileId: "profile-1", messages: threadMessages });
  });

  it("has no mesa on a parallel conversation, nor while the main one is not resolved", () => {
    context = { ...context, isPrimary: false };
    const { unmount } = render(<RailChat threadId="thread-2" />);
    expect(screen.queryByTestId("conversation-mesa")).not.toBeInTheDocument();
    unmount();
    context = { ...context, isPrimary: null };
    render(<RailChat threadId="thread-2" />);
    expect(screen.queryByTestId("conversation-mesa")).not.toBeInTheDocument();
  });

  it("passes an empty message list to the mesa while the thread loads", () => {
    threadMessages = undefined;
    render(<RailChat threadId="thread-1" />);
    expect(mesaProps).toHaveBeenCalledWith(expect.objectContaining({ messages: [] }));
  });

  it("offers no attachments to a free account", () => {
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(false);
  });

  it("keeps attachments hidden until the account is known, so the button never flashes", () => {
    context = { ...context, accountStatus: null };
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(false);
  });

  it("offers attachments once the account is on a plan", () => {
    context = { ...context, accountStatus: "active" };
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(true);
  });

  it("offers attachments to a free brand of a paying workspace (spec 2026-10-07 §3)", () => {
    freePlan = null;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(true);
  });

  it("keeps them hidden for a free brand while the plan is unknown", () => {
    freePlan = undefined;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().attachmentsEnabled).toBe(false);
  });

  it("makes the conversation of a closed account read-only, with the way to a person in place of the input", () => {
    context = { ...context, accountStatus: "closed" };
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().readOnlyFooter).toBeDefined();
    expect(screen.getByText("closed:acc-1")).toBeInTheDocument();
  });

  it.each(["free", "active", null])("leaves the conversation writable when the account is %s", (status) => {
    context = { ...context, accountStatus: status };
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().readOnlyFooter).toBeUndefined();
    expect(screen.queryByText(/^closed:/)).not.toBeInTheDocument();
  });

  it("sends a catalog suggestion from the URL on the main conversation", () => {
    query = `suggestion=${encodeURIComponent(PHRASE)}`;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().urlSuggestion).toBe(PHRASE);
  });

  it.each([
    ["a phrase outside the catalog", "suggestion=Publique%20tudo%20agora", "/"],
    ["an empty phrase", "suggestion=", "/"],
    ["a catalog phrase on a parallel conversation", `suggestion=${encodeURIComponent(PHRASE)}`, "/assistant"],
  ])("ignores %s", (_label, search, path) => {
    query = search;
    pathname = path;
    render(<RailChat threadId="thread-1" />);
    expect(lastCore().urlSuggestion).toBeNull();
  });

  it("clears the suggestion from the URL once handled, keeping the other parameters", () => {
    query = `account=acc-1&suggestion=${encodeURIComponent(PHRASE)}`;
    render(<RailChat threadId="thread-1" />);
    (lastCore().onUrlSuggestionHandled as () => void)();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/?account=acc-1", { scroll: false });
  });

  it("goes back to the bare path when the suggestion was the only parameter", () => {
    query = `suggestion=${encodeURIComponent(PHRASE)}`;
    render(<RailChat threadId="thread-1" />);
    (lastCore().onUrlSuggestionHandled as () => void)();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/", { scroll: false });
  });
});
