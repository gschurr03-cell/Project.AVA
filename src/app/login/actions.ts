"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/auth/returnTo";

function authErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email or password was incorrect.";
  if (normalized.includes("email not confirmed")) return "Confirm your email before signing in.";
  if (normalized.includes("already registered")) return "An account already exists for this email.";
  if (normalized.includes("password")) return "The password did not meet the account security requirements.";
  return "Authentication could not be completed. Please try again.";
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(authErrorMessage(error.message))}`);

  revalidatePath("/", "layout");
  redirect(safeReturnTo(formData.get("next")));
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(authErrorMessage(error.message))}`);

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
  const localEnvironment = !process.env.AVA_ENVIRONMENT || ["local", "test"].includes(process.env.AVA_ENVIRONMENT);
  const origin=process.env.NEXT_PUBLIC_APP_URL ?? (localEnvironment ? "http://localhost:3000" : null);
  if(!origin) redirect("/login?error=Password%20reset%20is%20not%20configured.%20Contact%20support.");
  if(email) await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?next=/reset-password`});
  redirect("/login?message=reset-sent");
}

export async function updatePassword(formData:FormData){
  const password=String(formData.get("password")??"");
  if(password.length<8) redirect("/reset-password?error=Password%20must%20be%20at%20least%208%20characters.");
  const supabase=await createClient();
  const {error}=await supabase.auth.updateUser({password});
  if(error) redirect(`/reset-password?error=${encodeURIComponent("Password could not be updated. Request a new reset link and try again.")}`);
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
