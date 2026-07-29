import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { environmentReadiness } from "@/lib/config/env";
export async function GET(){
  const env=environmentReadiness();
  let database=false;
  try{const supabase=await createClient();const {error}=await supabase.from("profiles").select("id",{head:true,count:"exact"}).limit(1);database=!error;}catch{}
  return NextResponse.json({status:env.ready&&database?"ready":"not_ready",checks:{environment:env.ready,database},timestamp:new Date().toISOString()},{status:env.ready&&database?200:503,headers:{"Cache-Control":"no-store"}});
}
