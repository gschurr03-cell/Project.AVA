import { getAvaStatus, getAvaStatusStyle, type AvaMetricStatus } from "@/lib/design/ava";

type AvaMetricCardProps = {
  label: string;
  value: string;
  unit?: string;
  status: AvaMetricStatus;
  note?: string;
  muted?: boolean;
};

export function AvaMetricCard({
  label,
  value,
  unit,
  status,
  note,
  muted = false,
}: AvaMetricCardProps) {
  const statusMeta = getAvaStatus(status);
  const statusStyle = getAvaStatusStyle(status);

  return (
    <div
      className={[
        "group rounded-2xl border border-white/[0.08] bg-[#182233] p-4",
        "shadow-[0_6px_24px_rgba(0,0,0,0.20)] transition duration-200",
        "hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-[#223047]",
        muted ? "opacity-75" : "",
      ].join(" ")}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-[#b3bccb]">
            {label}
          </dt>

          {note ? (
            <p className="mt-1 text-xs leading-5 text-[#7e8797]">{note}</p>
          ) : null}
        </div>

        <div
          className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={statusStyle}
          title={statusMeta.label}
        >
          {statusMeta.tier}
        </div>
      </div>

      <dd className="flex items-end gap-2">
        <span className="text-3xl font-semibold tracking-tight text-[#f5f7fb]">
          {value}
        </span>

        {unit ? (
          <span className="mb-1 text-sm font-medium text-[#b3bccb]">
            {unit}
          </span>
        ) : null}
      </dd>

      <div
        className="mt-4 h-1 rounded-full"
        style={{
          background:
            status === "missing"
              ? "rgba(107,114,128,0.3)"
              : `linear-gradient(90deg, ${statusMeta.color}, transparent)`,
        }}
      />
    </div>
  );
}
