import TopBar from "@/components/layout/TopBar";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";
import V6PreviewSidebar from "./_components/V6PreviewSidebar";

export default function V6PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeedbackProvider>
      <MissionInsightProvider>
        <div className="min-h-screen bg-[var(--canvas)]">
          <V6PreviewSidebar />
          <TopBar variant="v6-floating" />
          <main id="main" className="v6-shell-main">
            <div className="content-operational mx-auto max-w-[80rem] px-6 pb-8 pt-4 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </MissionInsightProvider>
    </FeedbackProvider>
  );
}
