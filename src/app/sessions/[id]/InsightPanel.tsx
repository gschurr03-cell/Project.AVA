import type { AnalysisMetrics } from "@/lib/biomechanics/types";

type Insight = {
  title: string;
  message: string;
};

function buildInsights(metrics: AnalysisMetrics) {
  const strengths: Insight[] = [];
  const watchItems: Insight[] = [];
  const priorities: Insight[] = [];

  if (metrics.strideFrequencyHz >= 4.8) {
    strengths.push({
      title: "Elite Rhythm",
      message: `Stride frequency is strong at ${metrics.strideFrequencyHz.toFixed(
        2,
      )} Hz.`,
    });
  } else if (metrics.strideFrequencyHz < 4.4) {
    priorities.push({
      title: "Improve Rhythm",
      message: `Stride frequency is ${metrics.strideFrequencyHz.toFixed(
        2,
      )} Hz. Focus on improving turnover and front-side mechanics.`,
    });
  } else {
    watchItems.push({
      title: "Rhythm Developing",
      message: `Stride frequency is ${metrics.strideFrequencyHz.toFixed(
        2,
      )} Hz. Good foundation, but there is room to improve cadence.`,
    });
  }

  if (metrics.groundContactTimeMs <= 90) {
    strengths.push({
      title: "Fast Ground Contact",
      message: `Ground contact is excellent at ${metrics.groundContactTimeMs.toFixed(
        0,
      )} ms.`,
    });
  } else if (metrics.groundContactTimeMs > 110) {
    priorities.push({
      title: "Reduce Ground Contact",
      message: `Ground contact is ${metrics.groundContactTimeMs.toFixed(
        0,
      )} ms. The athlete may be spending too much time on the ground.`,
    });
  } else {
    watchItems.push({
      title: "Monitor Ground Contact",
      message: `Ground contact is ${metrics.groundContactTimeMs.toFixed(
        0,
      )} ms. Continue monitoring as speed increases.`,
    });
  }

  if (metrics.flightTimeMs >= 115 && metrics.flightTimeMs <= 140) {
    strengths.push({
      title: "Balanced Flight Phase",
      message: `Flight time is ${metrics.flightTimeMs.toFixed(
        0,
      )} ms, indicating a good balance between projection and rhythm.`,
    });
  } else if (metrics.flightTimeMs < 105) {
    watchItems.push({
      title: "Low Flight Time",
      message: `Flight time is ${metrics.flightTimeMs.toFixed(
        0,
      )} ms. The athlete may benefit from more projection.`,
    });
  } else {
    watchItems.push({
      title: "High Flight Time",
      message: `Flight time is ${metrics.flightTimeMs.toFixed(
        0,
      )} ms. Watch for excessive bounding.`,
    });
  }

  return { strengths, watchItems, priorities };
}

function InsightSection({
  title,
  items,
}: {
  title: string;
  items: Insight[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-base font-semibold text-gray-800">{title}</h3>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.title} className="rounded border bg-white p-3">
            <p className="font-medium text-gray-800">{item.title}</p>
            <p className="mt-1 text-sm text-gray-500">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InsightPanel({
  metrics,
}: {
  metrics: AnalysisMetrics;
}) {
  const { strengths, watchItems, priorities } = buildInsights(metrics);

  return (
    <section className="mt-6 rounded border bg-gray-50 p-4">
      <h2 className="mb-2 text-lg font-semibold text-lane">
        AVA Coaching Insights
      </h2>

      <p className="mb-6 text-sm text-gray-500">
        AVA found {strengths.length} strength
        {strengths.length === 1 ? "" : "s"} and {priorities.length} priorit
        {priorities.length === 1 ? "y" : "ies"} from this sprint.
      </p>

      <InsightSection title="Strengths" items={strengths} />
      <InsightSection title="Watch Items" items={watchItems} />
      <InsightSection title="Priorities" items={priorities} />
    </section>
  );
}