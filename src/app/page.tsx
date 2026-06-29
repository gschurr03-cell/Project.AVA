import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-lane">Project AVA</h1>
      <p className="text-lg text-gray-700">
        Upload a sprint, get coach-ready biomechanics: stride length, ground
        contact time, joint angles, and top speed — derived automatically from
        video.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="rounded bg-lane px-4 py-2 font-medium text-white"
        >
          Go to dashboard
        </Link>
        <Link href="/login" className="rounded border border-lane px-4 py-2 font-medium text-lane">
          Sign in
        </Link>
      </div>
    </main>
  );
}
