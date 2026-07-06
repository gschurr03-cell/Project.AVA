type AvaInfoStatProps = {
  label: string;
  value: string;
};

export function AvaInfoStat({ label, value }: AvaInfoStatProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[#F5F5F7]">
        {value}
      </p>
    </div>
  );
}
