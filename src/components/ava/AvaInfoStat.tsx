type AvaInfoStatProps = {
  label: string;
  value: string;
};

export function AvaInfoStat({ label, value }: AvaInfoStatProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[#f5f7fb]">
        {value}
      </p>
    </div>
  );
}
