import AssistantMain from "@/components/assistant/AssistantMain";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { threadId } = await searchParams;
  return <AssistantMain threadId={threadId} />;
}
