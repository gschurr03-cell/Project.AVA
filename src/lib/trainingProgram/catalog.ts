import { z } from "zod";
import { TRAINING_CATALOG_VERSION, trainingDosageSchema } from "./contracts";

export const exerciseCatalogEntrySchema = z.object({
  id: z.string().min(1), version: z.literal(TRAINING_CATALOG_VERSION),
  status: z.enum(["draft", "review", "approved", "deprecated", "retired"]),
  name: z.string().min(1), category: z.enum(["warm_up", "acceleration", "max_velocity","speed_endurance","special_endurance","tempo","technical","plyometric","strength","power","mobility","recovery"]),
  objectives: z.array(z.string()).min(1), associatedMuscleGroups: z.array(z.string()),
  equipment: z.array(z.string()), facilities: z.array(z.string()), minimumTrainingAgeYears: z.number().nonnegative(),
  cues: z.array(z.string()).min(1), commonErrors: z.array(z.string()),
  contraindicationTags: z.array(z.string()), restrictionTags: z.array(z.string()),
  defaultDosage: trainingDosageSchema, evidenceIds: z.array(z.string()),
  progressionIds: z.array(z.string()).default([]), regressionIds: z.array(z.string()).default([]),
  advancedFeatureGate: z.string().nullable().default(null),
}).strict();
export type ExerciseCatalogEntry = z.infer<typeof exerciseCatalogEntrySchema>;

const BASE_CATALOG: readonly ExerciseCatalogEntry[] = [
  exerciseCatalogEntrySchema.parse({ id:"progressive-sprint-warmup",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Progressive sprint warm-up",category:"warm_up",objectives:["acceleration","max_velocity"],associatedMuscleGroups:[],equipment:[],facilities:["track","turf"],minimumTrainingAgeYears:1,cues:["Progress gradually; stop if pain is reported."],commonErrors:["Rushing progression"],contraindicationTags:["acute_pain"],restrictionTags:[],defaultDosage:{kind:"recovery",durationMinutes:20,intensity:"low",stoppingRule:"Stop and escalate any pain report."},evidenceIds:["expert-rule-warmup-v1"] }),
  exerciseCatalogEntrySchema.parse({ id:"standing-acceleration-20m",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Standing acceleration 20 m",category:"acceleration",objectives:["acceleration"],associatedMuscleGroups:["gluteal group","hamstring group","calf complex"],equipment:[],facilities:["track","turf"],minimumTrainingAgeYears:1,cues:["Project progressively and preserve technique."],commonErrors:["Reaching"],contraindicationTags:["acute_pain","sprint_prohibited"],restrictionTags:["lower_body"],defaultDosage:{kind:"sprint",sets:2,repetitions:3,distanceM:20,intensityPercent:92,restBetweenRepsSeconds:180,restBetweenSetsSeconds:360,surface:"track",startType:"standing",stoppingRule:"Stop on pain or more than 3% time/quality degradation."},evidenceIds:["internal-sprint-rule-v1"] }),
  exerciseCatalogEntrySchema.parse({ id:"fly-20m",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Fly 20 m",category:"max_velocity",objectives:["max_velocity"],associatedMuscleGroups:["hamstring group","gluteal group","calf complex"],equipment:[],facilities:["track"],minimumTrainingAgeYears:2,cues:["Stay tall and relaxed through the fly zone."],commonErrors:["Forcing frequency"],contraindicationTags:["acute_pain","high_speed_prohibited"],restrictionTags:["lower_body"],defaultDosage:{kind:"sprint",sets:1,repetitions:4,distanceM:20,intensityPercent:95,restBetweenRepsSeconds:360,restBetweenSetsSeconds:0,surface:"track",startType:"fly",stoppingRule:"Stop on pain or more than 3% velocity/technical degradation."},evidenceIds:["internal-maxv-rule-v1"] }),
  exerciseCatalogEntrySchema.parse({ id:"extensive-tempo-100m",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Extensive tempo 100 m",category:"tempo",objectives:["recovery","maintenance"],associatedMuscleGroups:[],equipment:[],facilities:["track","turf"],minimumTrainingAgeYears:0,cues:["Conversational, controlled rhythm."],commonErrors:["Turning tempo into sprinting"],contraindicationTags:["running_prohibited"],restrictionTags:["lower_body"],defaultDosage:{kind:"sprint",sets:2,repetitions:4,distanceM:100,intensityPercent:65,restBetweenRepsSeconds:60,restBetweenSetsSeconds:180,surface:"turf",startType:"standing",stoppingRule:"Stop if the effort cannot remain low intensity."},evidenceIds:["expert-rule-tempo-v1"] }),
  exerciseCatalogEntrySchema.parse({ id:"trap-bar-jump-rpe",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Trap-bar jump",category:"power",objectives:["power","strength"],associatedMuscleGroups:["gluteal group","quadriceps group","calf complex"],equipment:["trap_bar"],facilities:["weight_room"],minimumTrainingAgeYears:2,cues:["Move every repetition explosively."],commonErrors:["Grinding repetitions"],contraindicationTags:["lower_body_loading_prohibited"],restrictionTags:["lower_body"],defaultDosage:{kind:"lifting",sets:3,repetitions:3,loadMethod:"rpe",loadValue:6,restSeconds:180,tempo:null,stoppingRule:"Stop if velocity or landing quality deteriorates."},evidenceIds:["expert-power-rule-v1"] }),
  exerciseCatalogEntrySchema.parse({ id:"mobility-recovery",version:TRAINING_CATALOG_VERSION,status:"approved",name:"Mobility and recovery",category:"recovery",objectives:["recovery"],associatedMuscleGroups:[],equipment:[],facilities:[],minimumTrainingAgeYears:0,cues:["Use comfortable, non-painful ranges."],commonErrors:["Forcing range"],contraindicationTags:["clinician_prohibited"],restrictionTags:[],defaultDosage:{kind:"recovery",durationMinutes:25,intensity:"very_low",stoppingRule:"Do not continue through pain."},evidenceIds:["expert-recovery-rule-v1"] }),
];

const sprint=(id:string,name:string,category:"acceleration"|"max_velocity"|"speed_endurance"|"special_endurance"|"tempo"|"technical",
  objectives:string[],distanceM:number,intensityPercent:number,equipment:string[]=[],facilities:string[]=["track"],
  advancedFeatureGate:string|null=null)=>exerciseCatalogEntrySchema.parse({
  id,version:TRAINING_CATALOG_VERSION,status:"approved",name,category,objectives,
  associatedMuscleGroups:["gluteal group","hamstring group","calf complex"],
  equipment,facilities,minimumTrainingAgeYears:advancedFeatureGate?3:1,
  cues:["Preserve posture, rhythm and technical quality."],commonErrors:["Continuing after quality loss"],
  contraindicationTags:["acute_pain","sprint_prohibited"],restrictionTags:["lower_body"],
  defaultDosage:{kind:"sprint",sets:1,repetitions:category==="tempo"?6:4,distanceM,intensityPercent,
    restBetweenRepsSeconds:category==="tempo"?60:240,restBetweenSetsSeconds:0,surface:"track",
    startType:category==="max_velocity"?"fly":"standing",
    stoppingRule:"Stop on pain or configured time, velocity, or technical-quality degradation."},
  evidenceIds:["internal-sprint-rule-v1"],progressionIds:[],regressionIds:[],advancedFeatureGate,
});
const gym=(id:string,name:string,category:"strength"|"power"|"plyometric",objectives:string[],equipment:string[],
  minimumTrainingAgeYears=1,advancedFeatureGate:string|null=null)=>exerciseCatalogEntrySchema.parse({
  id,version:TRAINING_CATALOG_VERSION,status:"approved",name,category,objectives,
  associatedMuscleGroups:["gluteal group","hamstring group","quadriceps group"],
  equipment,facilities:["weight_room"],minimumTrainingAgeYears,cues:["Use coach-approved technique and preserve repetition quality."],
  commonErrors:["Loading beyond technical ability"],contraindicationTags:["acute_pain","lower_body_loading_prohibited"],
  restrictionTags:["lower_body"],defaultDosage:{kind:"lifting",sets:3,repetitions:category==="plyometric"?5:5,
    loadMethod:category==="strength"?"rpe":"bodyweight",loadValue:category==="strength"?7:null,
    restSeconds:180,tempo:null,stoppingRule:"Stop on pain or technical/velocity degradation."},
  evidenceIds:["expert-strength-rule-v1"],progressionIds:[],regressionIds:[],advancedFeatureGate,
});
const recovery=(id:string,name:string,category:"mobility"|"recovery",equipment:string[]=[])=>exerciseCatalogEntrySchema.parse({
  id,version:TRAINING_CATALOG_VERSION,status:"approved",name,category,objectives:["recovery"],
  associatedMuscleGroups:[],equipment,facilities:[],minimumTrainingAgeYears:0,
  cues:["Remain in comfortable non-painful ranges."],commonErrors:["Turning recovery into hard training"],
  contraindicationTags:["clinician_prohibited"],restrictionTags:[],
  defaultDosage:{kind:"recovery",durationMinutes:25,intensity:"very_low",stoppingRule:"Stop on pain or worsening symptoms."},
  evidenceIds:["expert-recovery-rule-v1"],progressionIds:[],regressionIds:[],advancedFeatureGate:null,
});
const ADDITIONAL_CATALOG:ExerciseCatalogEntry[]=[
  sprint("falling-start-20m","Falling start 20 m","acceleration",["acceleration"],20,90),
  sprint("two-point-start-30m","Two-point start 30 m","acceleration",["acceleration"],30,94),
  sprint("three-point-start-30m","Three-point start 30 m","acceleration",["acceleration"],30,95),
  sprint("block-start-30m","Block start 30 m","acceleration",["acceleration"],30,96,["starting_blocks"]),
  sprint("sled-start-20m","Resisted sled start 20 m","acceleration",["acceleration","strength"],20,90,["sled"],["track"],"advanced_resisted_sprinting"),
  sprint("hill-acceleration-30m","Hill acceleration 30 m","acceleration",["acceleration"],30,90,[],["hill"],"advanced_hill_sprinting"),
  sprint("wicket-run","Wicket run","technical",["technical_consistency","max_velocity"],30,90,["wickets"]),
  sprint("ins-and-outs-80m","Ins-and-outs 80 m","max_velocity",["max_velocity","technical_consistency"],80,94,[],["track"],"advanced_max_velocity"),
  sprint("maxv-buildup-60m","Maximum-velocity buildup 60 m","max_velocity",["max_velocity"],60,94),
  sprint("speed-endurance-120m","Speed endurance 120 m","speed_endurance",["speed_endurance"],120,90),
  sprint("special-endurance-200m","Special endurance 200 m","special_endurance",["speed_endurance"],200,90,[],["track"],"advanced_special_endurance"),
  sprint("technical-stride-80m","Technical stride 80 m","technical",["technical_consistency"],80,75),
  gym("pogo-hops","Pogo hops","plyometric",["reactive_strength"],[]),
  gym("alternating-bounds","Alternating bounds","plyometric",["power"],[]),
  gym("single-leg-bounds","Single-leg bounds","plyometric",["power"],[],2),
  gym("hurdle-hops","Hurdle hops","plyometric",["reactive_strength"],["hurdles"],2),
  gym("depth-jump","Depth jump","plyometric",["reactive_strength"],["box"],4,"advanced_depth_jumps"),
  gym("box-jump","Box jump","power",["power"],["box"]),
  gym("medball-forward-throw","Medicine-ball forward throw","power",["power"],["medicine_ball"]),
  gym("back-squat","Back squat","strength",["strength"],["rack","barbell"]),
  gym("front-squat","Front squat","strength",["strength"],["rack","barbell"]),
  gym("trap-bar-deadlift","Trap-bar deadlift","strength",["strength"],["trap_bar"]),
  gym("romanian-deadlift","Romanian deadlift","strength",["strength"],["barbell"]),
  gym("split-squat","Split squat","strength",["strength"],["dumbbells"]),
  gym("reverse-lunge","Reverse lunge","strength",["strength"],["dumbbells"]),
  gym("nordic-curl","Nordic curl","strength",["strength"],["nordic_bench"],2),
  gym("standing-calf-raise","Standing calf raise","strength",["strength"],[]),
  gym("hip-thrust","Hip thrust","strength",["strength"],["barbell","bench"]),
  gym("power-clean","Power clean","power",["power"],["barbell"],3,"advanced_olympic_lifts"),
  gym("hang-clean","Hang clean","power",["power"],["barbell"],3,"advanced_olympic_lifts"),
  gym("snatch-pull","Snatch-pull derivative","power",["power"],["barbell"],4,"advanced_olympic_lifts"),
  gym("push-press","Push press","power",["power"],["barbell"],2),
  recovery("dynamic-warmup","Dynamic warm-up","mobility"),
  recovery("mobility-circuit","Mobility circuit","mobility"),
  recovery("recovery-bike","Recovery bike","recovery",["stationary_bike"]),
  recovery("pool-recovery","Pool recovery","recovery",["pool"]),
  recovery("soft-tissue-session","Self-directed soft-tissue session","recovery",["foam_roller"]),
  recovery("breathing-session","Breathing recovery session","recovery"),
];
export const TRAINING_EXERCISE_CATALOG:readonly ExerciseCatalogEntry[]=Object.freeze([...BASE_CATALOG,...ADDITIONAL_CATALOG]);

export function approvedExercise(id: string) {
  const exercise=TRAINING_EXERCISE_CATALOG.find(item=>item.id===id);
  if(!exercise||exercise.status!=="approved") throw new Error(`Unknown or unapproved exercise: ${id}`);
  return exercise;
}
