import { redirect, notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";

export default async function CreativeWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ workspace }, { id }] = await Promise.all([requireWorkspaceAccess(), params]);
  const aggregate = await getCreativeWork(workspace.id, id);
  if (!aggregate) notFound();
  // Peça única resumes inside the contained box; other intents keep the
  // dedicated surface until their convergence slice.
  if (aggregate.work.toolKind === "single") redirect(`/?workId=${encodeURIComponent(id)}&compose=1`);
  return <CreativeWorkResumeSurface workId={id} />;
}
