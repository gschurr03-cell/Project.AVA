import { createClient } from "@supabase/supabase-js";
import { E2E } from "./fixture";

export function admin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("E2E requires local Supabase environment variables.");
  const host=new URL(url).hostname;
  if(!["127.0.0.1","localhost","::1"].includes(host))throw new Error("E2E refuses non-local Supabase.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function findUser(email:string){
  const db=admin();
  for(let page=1;;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:200});if(error)throw error;
    const user=data.users.find(item=>item.email===email);if(user)return user;if(data.users.length<200)return null;}
}
export async function removeUsers(){
  const db=admin();
  for(const email of [E2E.ownerEmail,E2E.intruderEmail]){
    const user=await findUser(email);if(!user)continue;
    let last:unknown;
    for(let attempt=0;attempt<3;attempt++){const {error}=await db.auth.admin.deleteUser(user.id);if(!error){last=null;break;}last=error;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}
    if(last)throw last;
  }
}
export async function removeFixtureData(){
  const db=admin();
  const {error}=await db.from("athletes").delete().eq("id",E2E.athleteId);
  if(error)throw error;
}
