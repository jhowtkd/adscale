import V6ShellLayout from "@/components/layout/V6ShellLayout";

export default function V6PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <V6ShellLayout sidebarVariant="preview">
      <main id="main" className="v6-shell-main">
        <div className="content-operational mx-auto max-w-[80rem] px-6 pb-8 pt-4 lg:px-8">
          {children}
        </div>
      </main>
    </V6ShellLayout>
  );
}
