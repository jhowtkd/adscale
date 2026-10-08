import { redirect } from "next/navigation";
import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { getTranslations } from "next-intl/server";
import { legacyComposerHref, type PageSearchParams } from "@/lib/studio/composer-href";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { resolveActiveBrand } from "@/server/brands/active-brand";
import { RefreshForFirstBrand } from "@/lib/brands/active-brand-context";
import { executeCommand } from "@/server/equipe/module/commands";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  // Spec 2026-10-07 §2: the composer left `/`. An old link that opened it here (a bookmark, an e-mail, the way back from
  // the login) goes to its page with the same query; the conversation's own query stays.
  const legacyComposer = legacyComposerHref(params);
  if (legacyComposer) redirect(legacyComposer);
  const { user, workspace } = await requireWorkspaceAccess();
  const t = await getTranslations("assistant");
  if (!user.emailVerified) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]" role="status">{t("homeVerifyEmail")}</p>;
  }
  const activeBrand = await resolveActiveBrand(workspace.id);
  const opened = await executeCommand(
    createEquipeRouteDeps(workspace.id),
    { actor: { kind: "system", job: "home.first_open" }, workspaceId: workspace.id },
    { type: "open_free_account", payload: { userId: user.id, ...(activeBrand ? { clientProfileId: activeBrand.id } : {}) } },
  );
  const threadId = opened.ok ? opened.value.data.assistantThreadId : null;
  if (typeof threadId !== "string" || !threadId) {
    const errorKey = !opened.ok && opened.error.code === "forbidden_actor" ? "homeOwnerFirst" : "homeOpenError";
    return <p className="p-6 text-sm text-[var(--danger-text)]" role="alert">{t(errorKey)}</p>;
  }
  // With no brand before, this opening created the first one, after the layout drew the rail without it. The shape is
  // the same either way (a fragment), so the conversation keeps its place in the tree when the refresh unmounts.
  return (
    <>
      <ConversationScreen threadId={threadId} />
      {activeBrand ? null : <RefreshForFirstBrand />}
    </>
  );
}
