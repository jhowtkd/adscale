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
          <TopBar />
          <main id="main" className="shell-offset-top content-operational mx-auto px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </MissionInsightProvider>
    </FeedbackProvider>
  );
}
