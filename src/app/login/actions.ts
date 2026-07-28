"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/auth/returnTo";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/", "layout");
  redirect(safeReturnTo(formData.get("next")));
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  // When email confirmation is enabled, signUp succeeds but no session is
  // issued — the user must click the link in their email first. Redirecting to
  // /dashboard here would just bounce off the middleware, so surface a clear
  // "check your email" message on the login page instead.
  if (!data.session) {
    redirect("/login?message=check-email");
  }

  revalidatePath("/", "layout");
  redirect(safeReturnTo(formData.get("next")));
}

export async function requestPasswordReset(formData:FormData){
  const email=String(formData.get("email")??"").trim();
  const supabase=await createClient();
  const origin=process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000";
  if(email) await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?next=/reset-password`});
  redirect("/login?message=reset-sent");
}

export async function updatePassword(formData:FormData){
  const password=String(formData.get("password")??"");
  if(password.length<8) redirect("/reset-password?error=Password%20must%20be%20at%20least%208%20characters.");
  const supabase=await createClient();
  const {error}=await supabase.auth.updateUser({password});
  if(error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
