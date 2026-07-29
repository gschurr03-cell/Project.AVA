"use client";

import { useEffect, useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

/* Clean outline icons (Lucide-style, consistent 1.75 stroke, no fills). */
const icon = (path: React.ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    );
  };

const IconDashboard = icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>);
const IconAthletes = icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5.4 5.4 0 0 0-3-4.8" /></>);
const IconSessions = icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="m10 13 4 2.5-4 2.5z" /></>);
const IconProgress = icon(<><path d="M3 3v18h18" /><path d="m7 15 3.5-4 3 2.5L21 7" /></>);
const IconSettings = icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.5 1.5 0 0 0 .3 1.6l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.5 1.5 0 0 0-2.6 1V21a2 2 0 1 1-4 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.5 1.5 0 0 0 4.6 15H4.4a2 2 0 1 1 0-4h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1A2 2 0 1 1 8.3 5.5l.1.1a1.5 1.5 0 0 0 1.6.3H10a1.5 1.5 0 0 0 1-1.4V4a2 2 0 1 1 4 0v.2a1.5 1.5 0 0 0 2.6 1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.5 1.5 0 0 0-.3 1.6V10a1.5 1.5 0 0 0 1.4 1h.2a2 2 0 1 1 0 4h-.2a1.5 1.5 0 0 0-1.4 1Z" /></>);
const IconPlus = icon(<><path d="M12 5v14M5 12h14" /></>);
const IconUpload = icon(<><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>);

type Item = { label: string; href: string; Icon: (p: SVGProps<SVGSVGElement>) => React.JSX.Element };

const PRIMARY: Item[] = [
  { label: "Dashboard", href: "/dashboard", Icon: IconDashboard },
  { label: "Athletes", href: "/athletes", Icon: IconAthletes },
  { label: "Sessions", href: "/sessions", Icon: IconSessions },
  { label: "Progress", href: "/coach", Icon: IconProgress },
];
const TOOLS: Item[] = [
  { label: "Settings", href: "/account", Icon: IconSettings },
  { label: "Help", href: "/help", Icon: IconSettings },
];
const QUICK: Item[] = [
  { label: "New Athlete", href: "/athletes?new=1", Icon: IconPlus },
  { label: "Upload Video", href: "/athletes", Icon: IconUpload },
];

function isActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function NavList({ items, pathname, onNavigate }: { items: Item[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ label, href, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={label}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60 ${
                active
                  ? "bg-[#2f80ed]/14 text-[#f5f7fb]"
                  : "text-[#b3bccb] hover:bg-white/[0.05] hover:text-[#f5f7fb]"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#3b8eff]" : "text-[#7e8797]"}`} />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">{children}</p>;
}

function SidebarBody({ userEmail, onNavigate }: { userEmail: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        <span className="text-lg font-bold tracking-tight text-[#f5f7fb]" style={{ fontFamily: "var(--font-display)" }}>
          AVA
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#3b8eff]">Sprint</span>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2">
        <SectionLabel>Primary</SectionLabel>
        <NavList items={PRIMARY} pathname={pathname} onNavigate={onNavigate} />
        <SectionLabel>Tools</SectionLabel>
        <NavList items={TOOLS} pathname={pathname} onNavigate={onNavigate} />
        <SectionLabel>Quick actions</SectionLabel>
        <NavList items={QUICK} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="mt-2 border-t border-white/[0.08] p-3">
        <p className="mb-2 truncate text-xs text-[#7e8797]" title={userEmail}>{userEmail}</p>
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#7e8797]">
          <Link href="/privacy" onClick={onNavigate} className="hover:text-[#b3bccb]">Privacy</Link>
          <Link href="/terms" onClick={onNavigate} className="hover:text-[#b3bccb]">Terms</Link>
          <Link href="/data-retention" onClick={onNavigate} className="hover:text-[#b3bccb]">Retention</Link>
          <Link href="/support" onClick={onNavigate} className="hover:text-[#b3bccb]">Support</Link>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm font-medium text-[#b3bccb] outline-none transition hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Persistent application sidebar (navy/blue). Fixed on desktop (lg+), a slide-in drawer
 * on smaller screens with a top bar toggle. Keyboard-navigable: links are focusable, the
 * drawer traps nothing but closes on Escape / backdrop click / navigation.
 */
export default function AppSidebar({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Desktop persistent rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/[0.08] bg-[#101827] py-4 lg:block">
        <SidebarBody userEmail={userEmail} />
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#101827] px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.1] text-[#b3bccb] outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#2f80ed]/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-base font-bold tracking-tight text-[#f5f7fb]" style={{ fontFamily: "var(--font-display)" }}>AVA</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#3b8eff]">Sprint</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-white/[0.08] bg-[#101827] py-4 shadow-2xl">
            <SidebarBody userEmail={userEmail} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
