// Read-only Phase 7.3A identity/artifact snapshot. Never mutates database/storage.
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const ids = [
  ["gav", "e04a7983-7406-4a00-bb89-8ada7b10bf9f", "3a148f45-02ff-492d-b9f1-790470b83c21"],
  ["vanni240", "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", "a7679326-e193-4489-bf50-735fe402ec60"],
  ["vanni120", "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", "6d9a6aba-d099-4a33-b8ea-2dd4962fe80c"],
  ["vanni60", "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", "8f55936c-cf07-4c20-ba73-b662e8d24325"],
];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const out = "tmp/phase73a/production-artifacts"; await mkdir(out,{recursive:true}); const manifest=[];
for (const [label,sessionId,analysisId] of ids) {
  const [{data:s,error:se},{data:a,error:ae}] = await Promise.all([
    db.from("sessions").select("id,current_working_analysis_id,original_filename,video_path,fps,fps_override,width,height,duration_s").eq("id",sessionId).single(),
    db.from("analyses").select("id,session_id,status,keypoints_path,metrics,created_at,completed_at").eq("id",analysisId).single(),
  ]); if(se)throw se;if(ae)throw ae;
  const {data:blob,error:be}=await db.storage.from("pose-artifacts").download(a.keypoints_path);if(be)throw be; const bytes=Buffer.from(await blob.arrayBuffer()); const local=`${out}/${label}.pose.json`; await writeFile(local,bytes,{mode:0o600});
  manifest.push({label,session:s,analysis:{...a,metrics:undefined},poseArtifact:{storageBucket:"pose-artifacts",storagePath:a.keypoints_path,localAuditCopy:local,bytes:bytes.length},contactArtifact:null,contactArtifactExplanation:"No persisted contact artifact exists; contacts are reconstructed from the pose artifact."});
}
await writeFile("tmp/phase73a/production-identities.json",JSON.stringify({schema:"phase-7.3a-production-identities-v1",capturedAt:new Date().toISOString(),benchmarks:manifest},null,2)+"\n");
console.log(JSON.stringify(manifest.map(x=>({label:x.label,sessionId:x.session.id,analysisId:x.analysis.id,posePath:x.poseArtifact.storagePath,bytes:x.poseArtifact.bytes})),null,2));
