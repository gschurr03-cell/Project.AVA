import Link from "next/link";

export default function HomePage() {
  return (
    <main className="ava-carbon mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">
        AVA · Sprint Performance Analysis
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-[#f5f7fb]">Project AVA</h1>
      <p className="text-lg text-[#b3bccb]">
        Upload a sprint video, confirm the measured zone, and review five trusted performance
        metrics with evidence-linked limiting factors and focused coaching directions.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="ava-red-glow rounded-lg bg-[#2f80ed] px-5 py-2.5 font-semibold text-white transition hover:bg-[#3b8eff]"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 font-semibold text-[#f5f7fb] transition hover:bg-white/[0.08]"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
