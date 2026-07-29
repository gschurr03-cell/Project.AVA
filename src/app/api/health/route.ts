import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { environmentReadiness } from "@/lib/config/env";
export async function GET(){
  const env=environmentReadiness();
  let database=false;
  try{
    const supabase=createServiceClient();
    const {error,status}=await supabase.from("analysis_jobs").select("id",{head:true,count:"exact"}).limit(1);
    database=!error;
    if(error)console.error("health_database_check_failed",{code:error.code,status,message:error.message.slice(0,160)});
  }catch(error){
    console.error("health_database_check_failed",{
      code:"health_check_exception",
      status:500,
      message:error instanceof Error?error.message.slice(0,160):"Unknown health-check error",
    });
  }
  return NextResponse.json({status:env.ready&&database?"ready":"not_ready",checks:{environment:env.ready,database},timestamp:new Date().toISOString()},{status:env.ready&&database?200:503,headers:{"Cache-Control":"no-store"}});
}
