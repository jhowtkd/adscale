"use client";

import AdminSidebar from "./AdminSidebar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--deep-bg)]">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
    </div>
  );
}
