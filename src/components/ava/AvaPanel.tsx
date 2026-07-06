import type { ReactNode } from "react";

type AvaPanelProps = {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
};

export function AvaPanel({ title, eyebrow, children, className = "" }: AvaPanelProps) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur ${className}`}
    >
      {(title || eyebrow) && (
        <div className="mb-5">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D72638]">
              {eyebrow}
            </p>
          ) : null}

          {title ? (
            <h2 className="text-lg font-semibold tracking-tight text-[#F5F5F7]">
              {title}
            </h2>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}
