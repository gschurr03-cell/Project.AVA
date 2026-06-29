import { login, signup } from "./actions";

/**
 * Email/password auth form. Both buttons submit to Server Actions so no
 * Supabase credentials touch the client beyond the anon key.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-lane">Sign in to AVA</h1>
      <form className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="rounded border px-3 py-2"
        />
        <div className="flex gap-3">
          <button formAction={login} className="flex-1 rounded bg-lane px-4 py-2 text-white">
            Log in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded border border-lane px-4 py-2 text-lane"
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
