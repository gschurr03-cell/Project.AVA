import { login, requestPasswordReset, signup } from "./actions";

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
  searchParams: Promise<{ error?: string; message?: string; next?:string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <main className="ava-carbon mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">AVA</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#f5f7fb]">Sign in to AVA</h1>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[#e46464]/40 bg-[#e46464]/10 px-3 py-2 text-sm text-[#e46464]"
        >
          {error}
        </p>
      )}
      {message === "check-email" && (
        <p
          role="status"
          className="rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-2 text-sm text-[#f5c451]"
        >
          Almost there — check your email for a confirmation link to finish
          signing up.
        </p>
      )}
      {message === "reset-sent" && <p role="status" className="rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-2 text-sm text-[#f5c451]">If an account exists, a password-reset link has been sent.</p>}
      <form className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next??"/dashboard"}/>
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded-lg border border-white/[0.08] bg-[#182233] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded-lg border border-white/[0.08] bg-[#182233] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            formAction={login}
            className="flex-1 rounded-lg bg-[#2f80ed] px-4 py-2 font-semibold text-white transition hover:bg-[#3b8eff]"
          >
            Log in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 font-semibold text-[#f5f7fb] transition hover:bg-white/[0.08]"
          >
            Sign up
          </button>
        </div>
      </form>
      <form action={requestPasswordReset} className="mt-2 flex gap-2">
        <input aria-label="Reset email" name="email" type="email" required placeholder="Email for password reset" className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#182233] px-3 py-2 text-sm text-white"/>
        <button className="rounded-lg border border-white/10 px-3 text-xs text-[#b3bccb]">Reset</button>
      </form>
    </main>
  );
}
