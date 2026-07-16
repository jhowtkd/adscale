import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ workId?: string | string[] }>;
}) {
  const value = (await searchParams).workId;
  return <DashboardHomeActions workId={typeof value === "string" ? value : undefined} />;
}
