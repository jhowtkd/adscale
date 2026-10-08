"use client";

// The chat of the pilot conversation: the v4 chrome around AssistantChatCore, the mesa on the main conversation,
// no attach button for a free account, and `/?suggestion=` (the fixed phrases of the empty screens) sent once.

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AssistantChatCore from "@/components/assistant/AssistantChatCore";
import ConversationMesa from "@/components/assistant/mesa/ConversationMesa";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";
import { useConversationContext } from "@/lib/equipe/use-conversation-context";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";
import { isCatalogSuggestion } from "@/lib/equipe/suggestions";
import { ClosedAccountRequest } from "@/components/billing/FreePlanCta";

export default function RailChat({ threadId }: { threadId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const conversation = useConversationContext(threadId);
  const thread = useAssistantThread(threadId);

  // Attachments are refused on the free plan (with a notice, by the server), so the screen does not offer them. A free brand
  // of a paying workspace is not on it (spec 2026-10-07 §3). For a free account, wait until the workspace plan is known so
  // the button never flashes and then disappears.
  const freePlan = useFreePlanAccount();
  const attachmentsEnabled = conversation.accountStatus !== null
    && (conversation.accountStatus !== "free" || freePlan === null);
  // The suggestion belongs to the main conversation, which is where the empty screens lead.
  const phrase = params.get("suggestion");
  const suggestion = pathname === "/" && isCatalogSuggestion(phrase) ? phrase : null;

  // A closed account's conversation stays readable and takes no new turn (spec 2026-10-07 §4): the input gives way to the
  // way to a person.
  const closedAccountId = conversation.accountStatus === "closed" ? conversation.accountId : null;

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
        readOnlyFooter={closedAccountId ? (
          <div className="px-4 pb-6 md:px-9">
            <ClosedAccountRequest accountId={closedAccountId} />
          </div>
        ) : undefined}
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
