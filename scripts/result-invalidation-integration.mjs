import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from("analyses").select("id,experimental_timing_result_hash,performance_result_status,performance_result_invalid_reason,performance_result_invalidated_at,excluded_from_history_trends,excluded_from_benchmarks,excluded_from_predictions,excluded_from_recommendations").eq("experimental_timing_result_hash","237392ec");
if(error)throw new Error(error.message);assert.equal(data.length,3);
for(const row of data){assert.equal(row.performance_result_status,"invalid_gate_propagation");assert.match(row.performance_result_invalid_reason,/physical gates did not remain aligned/);assert.ok(row.performance_result_invalidated_at);assert.equal(row.excluded_from_history_trends,true);assert.equal(row.excluded_from_benchmarks,true);assert.equal(row.excluded_from_predictions,true);assert.equal(row.excluded_from_recommendations,true);}
console.log(JSON.stringify({invalidatedRows:data.length,status:"invalid_gate_propagation",immutableResultsPreserved:true,allDownstreamExclusions:true},null,2));
