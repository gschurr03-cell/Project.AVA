import type { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

/**
 * Authenticated application shell: the persistent sidebar (desktop) / drawer (mobile)
 * plus the main content column. Content is offset for the fixed rail on lg+, and for the
 * mobile top bar below it. Presentation only — no data logic here.
 */
export default function AppShell({
  userEmail,
  children,
  wide = false,
}: {
  userEmail: string;
  children: ReactNode;
  /** Widen the content column (max-w-7xl) for dense multi-panel pages like the analysis view. */
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#081019]">
      <AppSidebar userEmail={userEmail} />
      <div className="lg:pl-60">
        <main className="ava-carbon min-h-screen px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16 sm:px-6 lg:px-8 lg:pt-8">
          <div className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-6xl"}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
