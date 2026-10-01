import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/assistant-message", () => ({
  createAssistantMessage: vi.fn(),
  createAssistantPlanOfferOnce: vi.fn(),
  listAssistantMessages: vi.fn(),
}));

import {
  createAssistantMessage,
  createAssistantPlanOfferOnce,
  listAssistantMessages,
} from "@/server/repositories/assistant-message";
import { liveConversationWriter } from "./chat-turn";

const offer = {
  threadId: "thread-1",
  type: "equipe_card" as const,
  content: "ADScale para a sua marca",
  payload: { kind: "plan_offer" as const, accountId: "account-1", title: "ADScale para a sua marca", items: [] },
};

describe("liveConversationWriter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts and lists through the assistant repository, scoped to the workspace", async () => {
    vi.mocked(createAssistantMessage).mockResolvedValue({ id: "msg-1" } as Awaited<ReturnType<typeof createAssistantMessage>>);
    vi.mocked(listAssistantMessages).mockResolvedValue([{ type: "user", content: "oi" }] as Awaited<ReturnType<typeof listAssistantMessages>>);
    const writer = liveConversationWriter("ws-1");

    expect(await writer.post({ threadId: "thread-1", type: "assistant", content: "Olá" })).toEqual({ id: "msg-1" });
    expect(createAssistantMessage).toHaveBeenCalledWith("ws-1", { threadId: "thread-1", type: "assistant", content: "Olá" });
    expect(await writer.list("thread-1", { limit: 20 })).toEqual([{ type: "user", content: "oi" }]);
    expect(listAssistantMessages).toHaveBeenCalledWith("ws-1", "thread-1", { limit: 20 });
  });

  it("posts the plan offer once through the repository's thread-locked check", async () => {
    vi.mocked(createAssistantPlanOfferOnce).mockResolvedValue({ row: { id: "msg-offer" }, created: false } as Awaited<ReturnType<typeof createAssistantPlanOfferOnce>>);

    const posted = await liveConversationWriter("ws-1").postPlanOfferOnce?.(offer);

    expect(posted).toEqual({ id: "msg-offer", created: false });
    expect(createAssistantPlanOfferOnce).toHaveBeenCalledWith("ws-1", offer);
    expect(createAssistantMessage).not.toHaveBeenCalled();
  });
});
