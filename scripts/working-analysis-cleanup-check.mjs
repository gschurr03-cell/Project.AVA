import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error("Local Supabase environment is required.");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:sessions,error:sessionError}=await db.from("sessions")
  .select("id,original_filename,video_path,current_working_analysis_id");
if(sessionError) throw sessionError;
for(const session of sessions??[]){
  const {data:rows,error}=await db.from("analyses")
    .select("id,version_number,analysis_kind,is_current_working,status,performance_result_status,saved_version_number")
    .eq("session_id",session.id);
  if(error) throw error;
  const working=(rows??[]).filter(row=>row.is_current_working);
  assert.ok(working.length<=1,`session ${session.id} has multiple current working analyses`);
  assert.equal(session.current_working_analysis_id,working[0]?.id??null);
  assert.ok(session.video_path,`session ${session.id} lost its source video`);
  assert.ok((rows??[]).filter(row=>row.analysis_kind==="saved").every(row=>row.saved_version_number!=null));
}
const summaries=[];
for(const session of sessions??[]){
  const {data:all}=await db.from("analyses").select("id,analysis_kind,is_current_working,status,performance_result_status").eq("session_id",session.id);
  summaries.push({id:session.id,filename:session.original_filename,source:session.video_path,working:session.current_working_analysis_id,total:all?.length??0,visible:all?.filter(row=>row.analysis_kind!=="archived").length??0});
}
const panning=(sessions??[]).filter(session=>/pan|30m|fly/i.test(session.original_filename??"")
  || summaries.find(item=>item.id===session.id)?.total>=10);
for(const session of panning){
  const {data:visible,error}=await db.from("analyses")
    .select("id,analysis_kind,is_current_working,status,performance_result_status")
    .eq("session_id",session.id)
    .in("analysis_kind",["working","saved"]);
  if(error) throw error;
  assert.ok((visible??[]).filter(row=>row.analysis_kind==="working").length<=1);
}
const invalidPanning=[];
for(const session of sessions??[]){
  const {data:rows}=await db.from("analyses")
    .select("id,version_number,analysis_kind,is_current_working,performance_result_status")
    .eq("session_id",session.id);
  const working=rows?.find(row=>row.is_current_working);
  if(working?.performance_result_status==="invalid_gate_propagation"){
    const archivedVersions=rows?.filter(row=>row.analysis_kind==="archived").map(row=>row.version_number)??[];
    for(const version of [1,2,13,14,15,16]) assert.ok(archivedVersions.includes(version),`expected V${version} archived`);
    invalidPanning.push({id:session.id,working:working.id,invalidStatus:working.performance_result_status,archivedVersions});
  }
}
assert.ok(invalidPanning.length>=1,"invalid panning fixture was not found");
console.log(JSON.stringify({sessionsChecked:sessions?.length??0,sessions:summaries,panningSessions:panning.map(item=>({id:item.id,source:item.video_path,working:item.current_working_analysis_id})),invalidPanning},null,2));
