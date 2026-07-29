import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const CLOSED_BETA_LIMITS=Object.freeze({
  version:"closed-beta-resource-limits-v1",maximumVideoBytes:536_870_912,maximumVideoDurationSeconds:60,
  uploadsPerAthletePerDay:5,analysesPerAthletePerDay:5,planGenerationsPerAthletePerDay:3,
  readinessEventsPerAthletePerHour:12,trainingEventsPerAthletePerHour:120,exportsPerAccountPerDay:3,
  offlinePackageValidityHours:48,maximumRequestBytes:10_485_760,
});
export const RATE_LIMIT_POLICIES=Object.freeze({
  login:{limit:10,windowSeconds:900,dimensions:["ip","account"]},
  password_recovery:{limit:5,windowSeconds:3600,dimensions:["ip","account"]},
  upload_initiation:{limit:5,windowSeconds:86400,dimensions:["account","athlete"]},
  analysis_submission:{limit:5,windowSeconds:86400,dimensions:["account","athlete"]},
  plan_generation:{limit:3,windowSeconds:86400,dimensions:["account","athlete"]},
  readiness_submission:{limit:12,windowSeconds:3600,dimensions:["account","athlete"]},
  training_event:{limit:120,windowSeconds:3600,dimensions:["account","athlete","device"]},
  export:{limit:3,windowSeconds:86400,dimensions:["account"]},
}as const);

const SENSITIVE_KEY=/(authorization|cookie|token|secret|password|api.?key|signed.?url|pain.?description|medical|coach.?comment|video.?path)/i;
const SECRET_VALUE=/(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{10,}\.|service_role|supabase_service_role_key)/i;
export function redactTelemetry(value:unknown,depth=0):unknown{
  if(depth>6)return"[TRUNCATED]";
  if(typeof value==="string")return SECRET_VALUE.test(value)?"[REDACTED]":value.slice(0,1_000);
  if(Array.isArray(value))return value.slice(0,50).map(item=>redactTelemetry(item,depth+1));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>)
    .map(([key,item])=>[key,SENSITIVE_KEY.test(key)?"[REDACTED]":redactTelemetry(item,depth+1)]));
  return value;
}
export function safeCorrelationId(candidate:string|null|undefined){
  return candidate&&/^[a-zA-Z0-9_-]{8,100}$/.test(candidate)?candidate:randomUUID();
}
export function privacySafeSubjectId(ownerId:string,subjectId:string,telemetrySalt:string){
  if(telemetrySalt.length<16)throw new Error("telemetry_salt_too_short");
  return createHash("sha256").update(`${telemetrySalt}:${ownerId}:${subjectId}`).digest("hex").slice(0,24);
}

export const betaAccessSchema=z.object({enabled:z.boolean(),accountIds:z.array(z.string().uuid()).max(500),
  coachIds:z.array(z.string().uuid()).max(500),athleteIds:z.array(z.string().uuid()).max(2_000),
  minimumBuild:z.number().int().positive(),supportedAnalysisTypes:z.array(z.string()).max(20)}).strict();
export function authorizeClosedBeta(raw:unknown,input:{accountId:string;coachId?:string;athleteId?:string;build:number;analysisType?:string}){
  const policy=betaAccessSchema.parse(raw);
  const reasons:string[]=[];
  if(!policy.enabled)reasons.push("beta_disabled");
  if(!policy.accountIds.includes(input.accountId))reasons.push("account_not_allowlisted");
  if(input.coachId&&!policy.coachIds.includes(input.coachId))reasons.push("coach_not_allowlisted");
  if(input.athleteId&&!policy.athleteIds.includes(input.athleteId))reasons.push("athlete_not_allowlisted");
  if(input.build<policy.minimumBuild)reasons.push("unsupported_build");
  if(input.analysisType&&!policy.supportedAnalysisTypes.includes(input.analysisType))reasons.push("analysis_type_not_allowlisted");
  return{authorized:reasons.length===0,reasonCodes:reasons};
}

export function verifyTrainingPlanIntegrity(input:{ownerId:string;athleteId:string;requestedOwnerId:string;requestedAthleteId:string;
  lifecycle:string;approved:boolean;planVersion:number;activeVersion:number;fingerprint:string;expectedFingerprint:string;
  restrictionConflict:boolean}){
  const violations:string[]=[];
  if(input.ownerId!==input.requestedOwnerId)violations.push("cross_account");
  if(input.athleteId!==input.requestedAthleteId)violations.push("cross_athlete");
  if(!input.approved||!["scheduled","active"].includes(input.lifecycle))violations.push("draft_or_unapproved");
  if(input.planVersion!==input.activeVersion)violations.push("stale_revision");
  if(input.fingerprint!==input.expectedFingerprint)violations.push("fingerprint_mismatch");
  if(input.restrictionConflict)violations.push("restriction_conflict");
  return{executable:violations.length===0,violations};
}
