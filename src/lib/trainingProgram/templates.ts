import { z } from "zod";
import { TRAINING_CATALOG_VERSION } from "./contracts";
import { approvedExercise } from "./catalog";

export const SESSION_TEMPLATE_VERSION="training-session-templates-v1";
const blockSchema=z.object({
  kind:z.enum(["readiness","warm_up","preparation","primary","secondary","lifting","accessory","cooldown"]),
  required:z.boolean(),exerciseIds:z.array(z.string()).min(1),maximumSelections:z.number().int().positive(),
}).strict();
export const sessionTemplateSchema=z.object({
  id:z.string().min(1),version:z.literal(SESSION_TEMPLATE_VERSION),
  type:z.enum(["acceleration","max_velocity","speed_endurance","tempo","strength_power","recovery","competition","taper","testing"]),
  compatibleObjectives:z.array(z.string()).min(1),incompatibleObjectives:z.array(z.string()),
  blocks:z.array(blockSchema).min(2),estimatedDurationMinutes:z.number().positive().max(180),
  expectedLoad:z.object({neural:z.number().min(0).max(10),mechanical:z.number().min(0).max(10),metabolic:z.number().min(0).max(10),recoveryCost:z.number().min(0).max(10)}),
  requiredFacilities:z.array(z.string()),requiredEquipment:z.array(z.string()),
}).strict();
export type SessionTemplate=z.infer<typeof sessionTemplateSchema>;
const template=(value:Omit<SessionTemplate,"version">)=>sessionTemplateSchema.parse({...value,version:SESSION_TEMPLATE_VERSION});
export const TRAINING_SESSION_TEMPLATES:readonly SessionTemplate[]=Object.freeze([
  template({id:"acceleration-day-v1",type:"acceleration",compatibleObjectives:["acceleration"],incompatibleObjectives:["special_endurance"],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["progressive-sprint-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["falling-start-20m","two-point-start-30m","three-point-start-30m","block-start-30m"],maximumSelections:1},
    {kind:"lifting",required:false,exerciseIds:["trap-bar-jump-rpe","medball-forward-throw"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:80,expectedLoad:{neural:8,mechanical:7,metabolic:4,recoveryCost:7},requiredFacilities:["track"],requiredEquipment:[]}),
  template({id:"max-velocity-day-v1",type:"max_velocity",compatibleObjectives:["max_velocity","technical_consistency"],incompatibleObjectives:["special_endurance"],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["progressive-sprint-warmup"],maximumSelections:1},
    {kind:"preparation",required:false,exerciseIds:["wicket-run","maxv-buildup-60m"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["fly-20m","ins-and-outs-80m"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:80,expectedLoad:{neural:9,mechanical:8,metabolic:4,recoveryCost:8},requiredFacilities:["track"],requiredEquipment:[]}),
  template({id:"speed-endurance-day-v1",type:"speed_endurance",compatibleObjectives:["speed_endurance"],incompatibleObjectives:["max_velocity"],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["progressive-sprint-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["speed-endurance-120m","special-endurance-200m"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:90,expectedLoad:{neural:8,mechanical:8,metabolic:9,recoveryCost:9},requiredFacilities:["track"],requiredEquipment:[]}),
  template({id:"tempo-day-v1",type:"tempo",compatibleObjectives:["maintenance","recovery"],incompatibleObjectives:[],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["dynamic-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["extensive-tempo-100m","technical-stride-80m"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:50,expectedLoad:{neural:2,mechanical:3,metabolic:5,recoveryCost:3},requiredFacilities:[],requiredEquipment:[]}),
  template({id:"strength-day-v1",type:"strength_power",compatibleObjectives:["strength","power"],incompatibleObjectives:[],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["dynamic-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["trap-bar-deadlift","back-squat","front-squat"],maximumSelections:1},
    {kind:"secondary",required:true,exerciseIds:["romanian-deadlift","split-squat","reverse-lunge"],maximumSelections:1},
    {kind:"accessory",required:false,exerciseIds:["nordic-curl","standing-calf-raise","hip-thrust"],maximumSelections:2},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:75,expectedLoad:{neural:7,mechanical:8,metabolic:5,recoveryCost:7},requiredFacilities:["weight_room"],requiredEquipment:[]}),
  template({id:"recovery-day-v1",type:"recovery",compatibleObjectives:["recovery","maintenance"],incompatibleObjectives:[],blocks:[
    {kind:"primary",required:true,exerciseIds:["mobility-recovery","recovery-bike","pool-recovery","breathing-session"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["breathing-session"],maximumSelections:1}],
    estimatedDurationMinutes:30,expectedLoad:{neural:1,mechanical:1,metabolic:1,recoveryCost:1},requiredFacilities:[],requiredEquipment:[]}),
  template({id:"competition-day-v1",type:"competition",compatibleObjectives:["acceleration","max_velocity","speed_endurance","maintenance"],incompatibleObjectives:[],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["progressive-sprint-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["technical-stride-80m"],maximumSelections:1}],
    estimatedDurationMinutes:120,expectedLoad:{neural:9,mechanical:9,metabolic:8,recoveryCost:9},requiredFacilities:["track"],requiredEquipment:[]}),
  template({id:"taper-day-v1",type:"taper",compatibleObjectives:["maintenance","technical_consistency"],incompatibleObjectives:["special_endurance"],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["dynamic-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["technical-stride-80m"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:45,expectedLoad:{neural:5,mechanical:4,metabolic:2,recoveryCost:3},requiredFacilities:[],requiredEquipment:[]}),
  template({id:"testing-day-v1",type:"testing",compatibleObjectives:["acceleration","max_velocity","technical_consistency"],incompatibleObjectives:[],blocks:[
    {kind:"warm_up",required:true,exerciseIds:["progressive-sprint-warmup"],maximumSelections:1},
    {kind:"primary",required:true,exerciseIds:["two-point-start-30m","fly-20m"],maximumSelections:1},
    {kind:"cooldown",required:true,exerciseIds:["mobility-recovery"],maximumSelections:1}],
    estimatedDurationMinutes:75,expectedLoad:{neural:8,mechanical:7,metabolic:3,recoveryCost:7},requiredFacilities:["track"],requiredEquipment:[]}),
]);
export function trainingSessionTemplate(id:string){
  const value=TRAINING_SESSION_TEMPLATES.find(item=>item.id===id);if(!value)throw new Error(`Unknown template ${id}`);
  value.blocks.flatMap(block=>block.exerciseIds).forEach(id=>{const item=approvedExercise(id);if(item.version!==TRAINING_CATALOG_VERSION)throw new Error("template_catalog_version_mismatch")});
  return value;
}
