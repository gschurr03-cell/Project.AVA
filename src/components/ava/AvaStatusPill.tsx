type AvaStatusPillProps = {
  label: string;
  tone?: "red" | "gold" | "silver" | "bronze" | "gray";
};

const toneClass = {
  red: "border-[#2f80ed]/50 bg-[#2f80ed]/15 text-[#3b8eff]",
  gold: "border-[#f5c451]/50 bg-[#f5c451]/15 text-[#f5c451]",
  silver: "border-[#b3bccb]/50 bg-[#b3bccb]/15 text-[#b3bccb]",
  bronze: "border-[#f5c451]/50 bg-[#f5c451]/15 text-[#f5c451]",
  gray: "border-white/[0.1] bg-white/[0.04] text-[#b3bccb]",
};

export function AvaStatusPill({ label, tone = "gray" }: AvaStatusPillProps) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
