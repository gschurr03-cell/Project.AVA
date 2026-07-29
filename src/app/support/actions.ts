"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BETA_LIMITS } from "@/lib/beta/config";

const supportCategories = new Set([
  "authentication","profile","upload","calibration","analysis_failure","result_question",
  "report","privacy","account_deletion","data_export","feedback","other",
]);
const feedbackCategories = new Set([
  "confusing_workflow","recording_guidance","analysis_speed","metric_understanding",
  "limiter_quality","recommendation_usefulness","report_usefulness","feature_request","general",
]);

export async function submitSupportRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");
  const category = String(formData.get("category") ?? "");
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 120);
  const message = String(formData.get("message") ?? "").trim().slice(0, 4000);
  const sessionId = String(formData.get("session_id") ?? "").trim() || null;
  const analysisId = String(formData.get("analysis_id") ?? "").trim() || null;
  if (!supportCategories.has(category) || subject.length < 3 || message.length < 10)
    redirect("/support?error=Choose%20a%20category%20and%20provide%20a%20clear%20description.");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from("support_requests").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= BETA_LIMITS.maxSupportSubmissionsPerHour)
    redirect("/support?error=Support%20submission%20limit%20reached.%20Try%20again%20in%20one%20hour.");
  const reference = `AVA-SUP-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const { error } = await supabase.from("support_requests").insert({
    user_id: user.id, category, subject, message, session_id: sessionId, analysis_id: analysisId,
    safe_reference_id: reference,
    diagnostic_context: {
      appVersion: process.env.AVA_RELEASE_VERSION ?? "development",
      environment: process.env.AVA_ENVIRONMENT ?? "local",
      route: String(formData.get("current_route") ?? "/support").slice(0, 200),
      submittedAt: new Date().toISOString(),
    },
  });
  if (error) redirect("/support?error=The%20request%20could%20not%20be%20submitted.%20Check%20linked%20analysis%20ownership%20and%20try%20again.");
  redirect(`/support?submitted=${encodeURIComponent(reference)}`);
}

export async function submitFeedback(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");
  const category = String(formData.get("feedback_category") ?? "");
  const usefulness = String(formData.get("usefulness") ?? "") || null;
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 2000) || null;
  if (!feedbackCategories.has(category) || (usefulness && !["yes","partly","no"].includes(usefulness)))
    redirect("/support?error=Choose%20a%20valid%20feedback%20category.");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from("feedback_submissions").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= BETA_LIMITS.maxFeedbackSubmissionsPerHour)
    redirect("/support?error=Feedback%20submission%20limit%20reached.%20Try%20again%20later.");
  const { error } = await supabase.from("feedback_submissions").insert({
    user_id: user.id, category, usefulness, comment,
    current_route: String(formData.get("current_route") ?? "/support").slice(0, 200),
    may_contact: formData.get("may_contact") === "on",
  });
  if (error) redirect("/support?error=Feedback%20could%20not%20be%20saved.");
  redirect("/support?feedback=1");
}

