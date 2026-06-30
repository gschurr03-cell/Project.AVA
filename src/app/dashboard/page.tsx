import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { createAthlete } from "./actions";

/**
 * Authenticated landing page. Lists the signed-in coach's athletes as cards and
 * lets them add a new one. Protected by middleware, but we re-check the user
 * here to read their data.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, full_name, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-lane">Your athletes</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user.email}</span>
          <form action={logout}>
            <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form action={createAthlete} className="mb-6 flex gap-2">
        <input
          name="full_name"
          required
          placeholder="New athlete name"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
          Add athlete
        </button>
      </form>

      {athletes && athletes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {athletes.map((a) => (
            <li key={a.id}>
              <Link
                href={`/athletes/${a.id}`}
                className="block rounded border p-4 hover:border-lane hover:bg-gray-50"
              >
                <span className="font-medium text-lane">{a.full_name}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Added {new Date(a.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">No athletes yet. Add one to get started.</p>
      )}
    </main>
  );
}
