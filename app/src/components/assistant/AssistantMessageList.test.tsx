import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import AssistantMessageList from "./AssistantMessageList";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./markdown-lite", () => ({
  renderMarkdownLite: (value: string) => value,
}));

vi.mock("./AssistantEmptyState", () => ({
  default: () => <div data-testid="assistant-thread-empty-state" />,
}));

describe("AssistantMessageList", () => {
  it("exposes the actual overflow container for exact scroll restoration", () => {
    const scrollContainerRef = createRef<HTMLDivElement>();
    render(
      <AssistantMessageList
        messages={[]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
        scrollContainerRef={scrollContainerRef}
      />
    );

    expect(scrollContainerRef.current).toBe(
      screen.getByTestId("assistant-message-list")
    );
  });

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
