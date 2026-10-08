import { redirect } from "next/navigation";
import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { getTranslations } from "next-intl/server";
import { legacyComposerHref, type PageSearchParams } from "@/lib/studio/composer-href";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { usesEquipeProduct } from "@/server/equipe/module/free-plan";
import { resolveActiveBrand } from "@/server/brands/active-brand";
import { executeCommand } from "@/server/equipe/module/commands";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { studioStageProps } from "./studio-stage-props";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  // Spec 2026-10-07 §2: the composer left `/`. An old link that opened it here (a bookmark, an e-mail, the way back from
  // the login) goes to its page with the same query; the conversation's own query stays.
  const legacyComposer = legacyComposerHref(params);
  if (legacyComposer) redirect(legacyComposer);
  const { user, workspace } = await requireWorkspaceAccess();
  // A classic paying customer with no live Equipe account keeps the classic home: it never opens a free account
  // (ticket 11, part 2).
  if (await usesEquipeProduct(workspace.id)) {
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
    // The workspace started paying between the two reads: the command opened nothing, the home stays classic.
    const classicPaid = !opened.ok && opened.error.code === "classic_paid_access";
    if (!classicPaid && (typeof threadId !== "string" || !threadId)) {
      const errorKey = !opened.ok && opened.error.code === "forbidden_actor" ? "homeOwnerFirst" : "homeOpenError";
      return <p className="p-6 text-sm text-[var(--danger-text)]" role="alert">{t(errorKey)}</p>;
    }
    if (!classicPaid) return <ConversationScreen threadId={threadId as string} />;
  }
  return <DashboardHomeActions {...studioStageProps(workspace.id, params)} />;
}
