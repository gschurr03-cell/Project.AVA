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
      className={`rounded-2xl border border-white/[0.08] bg-[#182233] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.24)] ${className}`}
    >
      {(title || eyebrow) && (
        <div className="mb-5">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#2f80ed]">
              {eyebrow}
            </p>
          ) : null}

          {title ? (
            <h2 className="text-lg font-semibold tracking-tight text-[#f5f7fb]">
              {title}
            </h2>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}
