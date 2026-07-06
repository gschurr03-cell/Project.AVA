import { login, signup } from "./actions";

/**
 * Email/password auth form. Both buttons submit to Server Actions so no
 * Supabase credentials touch the client beyond the anon key.
 *
 * The actions redirect back here with `?error=` on failure or
 * `?message=check-email` after a signup that needs email confirmation; we read
 * those query params to give the user feedback.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="ava-carbon mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#D72638]">AVA</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F5F5F7]">Sign in to AVA</h1>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-sm text-[#ff8079]"
        >
          {error}
        </p>
      )}
      {message === "check-email" && (
        <p
          role="status"
          className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-sm text-[#E4C25A]"
        >
          Almost there — check your email for a confirmation link to finish
          signing up.
        </p>
      )}
      <form className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded-lg border border-white/[0.08] bg-[#19191C] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded-lg border border-white/[0.08] bg-[#19191C] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            formAction={login}
            className="flex-1 rounded-lg bg-[#D72638] px-4 py-2 font-semibold text-white transition hover:bg-[#e63a4b]"
          >
            Log in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 font-semibold text-[#F5F5F7] transition hover:bg-white/[0.08]"
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
