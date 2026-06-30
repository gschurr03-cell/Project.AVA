import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

/**
 * Authenticated landing page. Lists the signed-in coach's athletes. Protected
 * by middleware, but we re-check the user here to read their data.
 */
export default async function DashboardPage() {
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
      {athletes && athletes.length > 0 ? (
        <ul className="divide-y rounded border">
          {athletes.map((a) => (
            <li key={a.id} className="px-4 py-3">
              {a.full_name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">No athletes yet. Add one to get started.</p>
      )}
    </main>
  );
}
