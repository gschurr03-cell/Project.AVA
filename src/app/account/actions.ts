"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestAccountDeletion(formData:FormData){
  if(String(formData.get("confirmation")??"").trim()!=="DELETE MY ACCOUNT"){
    redirect("/account?error=Type%20the%20confirmation%20phrase%20exactly.");
  }
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {error}=await supabase.from("account_deletion_requests").insert({user_id:user.id});
  if(error&&error.code!=="23505")redirect(`/account?error=${encodeURIComponent("The deletion request could not be saved. Try again or contact support.")}`);
  redirect("/account?requested=1");
}
