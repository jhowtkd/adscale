import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardHomeActions {...parseDashboardSearchParams(await searchParams)} />;
}
