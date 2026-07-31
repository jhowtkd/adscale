import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";

export default async function CreativeWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CreativeWorkResumeSurface workId={id} />;
}
