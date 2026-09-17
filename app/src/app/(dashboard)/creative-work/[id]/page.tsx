import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { env } from "@/server/validation/env";

export default async function CreativeWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CreativeWorkResumeSurface
      workId={id}
      threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
    />
  );
}
