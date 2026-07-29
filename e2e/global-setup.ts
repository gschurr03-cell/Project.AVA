import { admin, findUser, removeFixtureData } from "./admin";
import { E2E } from "./fixture";

export default async function setup(){
  await removeFixtureData();
  const db=admin();
  for(const [email,name] of [[E2E.ownerEmail,"E2E Owner"],[E2E.intruderEmail,"E2E Intruder"]] as const){
    const existing=await findUser(email);
    const {error}=existing
      ? await db.auth.admin.updateUserById(existing.id,{password:E2E.password,email_confirm:true,user_metadata:{full_name:name}})
      : await db.auth.admin.createUser({email,password:E2E.password,email_confirm:true,user_metadata:{full_name:name}});
    if(error)throw error;
  }
  const owner=await findUser(E2E.ownerEmail);
  if(!owner)throw new Error("E2E owner creation failed.");
  const {error:athleteError}=await db.from("athletes").insert({
    id:E2E.athleteId,coach_id:owner.id,full_name:"Golden Path Sprinter",
    sex:"F",height_cm:170,weight_kg:62,personal_best_100m:11.5,
  });
  if(athleteError)throw athleteError;
  const {error:sessionError}=await db.from("sessions").insert({
    id:E2E.sessionId,athlete_id:E2E.athleteId,created_by:owner.id,
    name:"Golden Path Session",original_filename:"golden-path.mov",status:"uploaded",
    analysis_type:"fly",video_path:null,fps:60,fps_classification:"validated_60_fps_class",
  });
  if(sessionError)throw sessionError;
  const {error:analysisError}=await db.from("analyses").insert({
    id:E2E.analysisId,session_id:E2E.sessionId,status:"complete",model_version:"e2e-fixture",
    analysis_kind:"working",is_current_working:true,metrics:{},analysis_fps:60,
    analysis_pipeline_version:"e2e",metric_schema_version:"e2e",validation_status:"validated",
  });
  if(analysisError)throw analysisError;
  const {error:pointerError}=await db.from("sessions").update({current_working_analysis_id:E2E.analysisId,status:"complete"}).eq("id",E2E.sessionId);
  if(pointerError)throw pointerError;
}
