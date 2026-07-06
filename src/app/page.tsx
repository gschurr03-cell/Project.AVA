import Link from "next/link";

export default function HomePage() {
  return (
    <main className="ava-carbon mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#D72638]">
        AVA · Sprint Diagnosis
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-[#F5F5F7]">Project AVA</h1>
      <p className="text-lg text-[#A0A2A8]">
        Upload a sprint, get an AI performance diagnosis: your ranked limiting factors,
        achievable top speed, and the trusted metrics behind them — derived automatically
        from video.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="ava-red-glow rounded-lg bg-[#D72638] px-5 py-2.5 font-semibold text-white transition hover:bg-[#e63a4b]"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 font-semibold text-[#F5F5F7] transition hover:bg-white/[0.08]"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
