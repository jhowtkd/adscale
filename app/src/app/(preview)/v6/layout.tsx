import TopBar from "@/components/layout/TopBar";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";

export default function V6PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeedbackProvider>
      <MissionInsightProvider>
        <div className="min-h-screen bg-[var(--canvas)]">
          <TopBar variant="inline" />
          <main id="main" className="content-operational mx-auto p-6 lg:p-8">
            {children}
          </main>
        </div>
      </MissionInsightProvider>
    </FeedbackProvider>
  );
}
