import { cn } from "@/lib/utils";

export const campaignMasonryGridClassName =
  "columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 [column-gap:1.25rem]";

export const campaignMasonryItemClassName = "mb-5 break-inside-avoid";

interface CampaignMasonryGridProps {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export default function CampaignMasonryGrid({
  children,
  className,
  "data-testid": dataTestId = "campaign-masonry-grid",
}: CampaignMasonryGridProps) {
  return (
    <div
      className={cn(campaignMasonryGridClassName, className)}
      data-testid={dataTestId}
    >
      {children}
    </div>
  );
}

export function CampaignMasonryGridItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(campaignMasonryItemClassName, className)}>{children}</div>;
}
