import { cn } from "@/lib/utils";

export type PageFrameWidth =
  | "operational"
  | "workspace"
  | "form"
  | "reading"
  | "wide"
  | "fluid";

const WIDTH_CLASS: Record<PageFrameWidth, string> = {
  operational: "content-operational",
  workspace: "content-workspace",
  form: "content-form",
  reading: "content-reading",
  wide: "content-wide",
  fluid: "content-fluid",
};

export default function PageFrame({
  children,
  width = "operational",
  className,
}: {
  children: React.ReactNode;
  width?: PageFrameWidth;
  className?: string;
}) {
  return (
    <div className={cn("page-gutters w-full", WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}
