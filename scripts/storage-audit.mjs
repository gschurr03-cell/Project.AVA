import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error("Supabase service environment is required.");
const db=createClient(url,key,{auth:{persistSession:false}});
const [{data:sessions,error:sessionError},{data:analyses,error:analysisError}]=await Promise.all([
  db.from("sessions").select("id,video_path,status"),
  db.from("analyses").select("id,keypoints_path,analysis_kind,status"),
]);
if(sessionError||analysisError)throw sessionError??analysisError;
const missingVideoReferences=(sessions??[]).filter(row=>!row.video_path&&row.status!=="uploading").map(row=>row.id);
const poseReferences=(analyses??[]).filter(row=>row.keypoints_path).length;
console.log(JSON.stringify({mode:"dry_run",deleted:false,sessions:(sessions??[]).length,
  sourceReferences:(sessions??[]).filter(row=>row.video_path).length,poseReferences,
  missingVideoReferences,archivedPoseReferences:(analyses??[]).filter(row=>row.analysis_kind==="archived"&&row.keypoints_path).length,
  note:"Reference audit only; recursive bucket reconciliation requires a production inventory job."},null,2));
