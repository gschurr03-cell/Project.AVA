type AvaStatusPillProps = {
  label: string;
  tone?: "red" | "gold" | "silver" | "bronze" | "gray";
};

const toneClass = {
  red: "border-[#D72638]/50 bg-[#D72638]/15 text-[#ff6b78]",
  gold: "border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#D4AF37]",
  silver: "border-[#C0C0C0]/50 bg-[#C0C0C0]/15 text-[#C0C0C0]",
  bronze: "border-[#CD7F32]/50 bg-[#CD7F32]/15 text-[#CD7F32]",
  gray: "border-white/[0.1] bg-white/[0.04] text-[#A0A2A8]",
};

export function AvaStatusPill({ label, tone = "gray" }: AvaStatusPillProps) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
