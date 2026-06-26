import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AssistantMessageList from "./AssistantMessageList";

vi.mock("./markdown-lite", () => ({
  renderMarkdownLite: (value: string) => value,
}));

describe("AssistantMessageList", () => {
  it("does not render get_thread_context tool JSON in the transcript", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            id: "tool-1",
            type: "tool",
            content: '{"thread":{"name":"Main"}}',
            payload: {
              toolName: "get_thread_context",
              summary: '{"thread":{"name":"Main"}}',
            },
          },
        ]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.queryByTestId("assistant-tool-message")).not.toBeInTheDocument();
    expect(screen.queryByText(/"thread"/)).not.toBeInTheDocument();
  });

  it("renders safe tool summaries for non-context tools", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            id: "tool-2",
            type: "tool",
            content: "Ação proposta",
            payload: {
              toolName: "propose_action",
              summary: "Ação proposta",
            },
          },
        ]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.getByTestId("assistant-tool-message")).toHaveTextContent(
      "propose_action: Ação proposta"
    );
  });
});
