import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});
export const avaEnvironmentSchema=z.enum(["local","test","preview","shared_development","staging","closed_beta","production"]);
const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANALYSIS_WORKER_SECRET: z.string().min(16),
  AVA_ENVIRONMENT: avaEnvironmentSchema.default("local"),
  AVA_RELEASE_VERSION: z.string().min(1).max(100).default("development"),
  AVA_BETA_ALLOWLIST_ENABLED: z.enum(["true","false"]).default("false"),
  AVA_DIAGNOSTICS_ACCESS: z.enum(["disabled","internal_admin"]).default("disabled"),
  MOBILE_API_ENABLED: z.enum(["true","false"]).default("false"),
  MOBILE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(2_147_483_648).default(536_870_912),
  MOBILE_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  MOBILE_MINIMUM_APP_VERSION: z.string().min(1).max(50).default("0.1.0"),
}).superRefine((value,context)=>{
  if(["staging","closed_beta","production"].includes(value.AVA_ENVIRONMENT)){
    if(value.AVA_RELEASE_VERSION==="development")
      context.addIssue({code:"custom",path:["AVA_RELEASE_VERSION"],message:"A versioned release is required."});
    if(value.NEXT_PUBLIC_SUPABASE_URL.includes("localhost")||value.NEXT_PUBLIC_SUPABASE_URL.includes("127.0.0.1"))
      context.addIssue({code:"custom",path:["NEXT_PUBLIC_SUPABASE_URL"],message:"A managed environment URL is required."});
    if(value.AVA_DIAGNOSTICS_ACCESS!=="disabled"&&value.AVA_ENVIRONMENT==="production")
      context.addIssue({code:"custom",path:["AVA_DIAGNOSTICS_ACCESS"],message:"Public production diagnostics must be disabled."});
  }
  if(value.AVA_ENVIRONMENT==="closed_beta"&&value.AVA_BETA_ALLOWLIST_ENABLED!=="true")
    context.addIssue({code:"custom",path:["AVA_BETA_ALLOWLIST_ENABLED"],message:"Closed beta must fail closed behind an allowlist."});
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function serverEnv() {
  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANALYSIS_WORKER_SECRET: process.env.ANALYSIS_WORKER_SECRET,
    AVA_ENVIRONMENT: process.env.AVA_ENVIRONMENT,
    AVA_RELEASE_VERSION: process.env.AVA_RELEASE_VERSION,
    AVA_BETA_ALLOWLIST_ENABLED: process.env.AVA_BETA_ALLOWLIST_ENABLED,
    AVA_DIAGNOSTICS_ACCESS: process.env.AVA_DIAGNOSTICS_ACCESS,
    MOBILE_API_ENABLED: process.env.MOBILE_API_ENABLED,
    MOBILE_MAX_UPLOAD_BYTES: process.env.MOBILE_MAX_UPLOAD_BYTES,
    MOBILE_UPLOAD_TTL_SECONDS: process.env.MOBILE_UPLOAD_TTL_SECONDS,
    MOBILE_MINIMUM_APP_VERSION: process.env.MOBILE_MINIMUM_APP_VERSION,
  });
}

export function environmentReadiness() {
  const result=serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANALYSIS_WORKER_SECRET:process.env.ANALYSIS_WORKER_SECRET,
    AVA_ENVIRONMENT:process.env.AVA_ENVIRONMENT,
    AVA_RELEASE_VERSION:process.env.AVA_RELEASE_VERSION,
    AVA_BETA_ALLOWLIST_ENABLED:process.env.AVA_BETA_ALLOWLIST_ENABLED,
    AVA_DIAGNOSTICS_ACCESS:process.env.AVA_DIAGNOSTICS_ACCESS,
    MOBILE_API_ENABLED:process.env.MOBILE_API_ENABLED,
    MOBILE_MAX_UPLOAD_BYTES:process.env.MOBILE_MAX_UPLOAD_BYTES,
    MOBILE_UPLOAD_TTL_SECONDS:process.env.MOBILE_UPLOAD_TTL_SECONDS,
    MOBILE_MINIMUM_APP_VERSION:process.env.MOBILE_MINIMUM_APP_VERSION,
  });
  return { ready: result.success, missing: result.success ? [] : result.error.issues.map(issue=>issue.path.join(".")) };
}
