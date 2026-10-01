"use client";

// The chat of the pilot conversation: the v4 chrome around AssistantChatCore, the mesa on the main conversation,
// no attach button for a free account, and `/?suggestion=` (the fixed phrases of the empty screens) sent once.

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AssistantChatCore from "@/components/assistant/AssistantChatCore";
import ConversationMesa from "@/components/assistant/mesa/ConversationMesa";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";
import { useConversationContext } from "@/lib/equipe/use-conversation-context";
import { isCatalogSuggestion } from "@/lib/equipe/suggestions";

export default function RailChat({ threadId }: { threadId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const conversation = useConversationContext(threadId);
  const thread = useAssistantThread(threadId);

  // Attachments are refused for a free account (with a notice, by the server), so the screen does not offer them.
  // Until the account is known the button stays hidden: it must never flash and then disappear.
  const attachmentsEnabled = conversation.accountStatus !== null && conversation.accountStatus !== "free";
  // The suggestion belongs to the main conversation, which is where the empty screens lead.
  const phrase = params.get("suggestion");
  const suggestion = pathname === "/" && isCatalogSuggestion(phrase) ? phrase : null;

  const clearSuggestion = useCallback(() => {
    const rest = new URLSearchParams(params.toString());
    rest.delete("suggestion");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssistantChatCore
        threadId={threadId}
        variant="full"
        equipeEnabled
        chrome="rail"
        attachmentsEnabled={attachmentsEnabled}
        urlSuggestion={suggestion}
        onUrlSuggestionHandled={clearSuggestion}
        mesa={
          conversation.isPrimary === true ? (
            <ConversationMesa
              accountId={conversation.accountId}
              clientProfileId={conversation.clientProfileId}
              messages={thread.data?.messages ?? []}
            />
          ) : null
        }
      />
    </div>
  );
}
