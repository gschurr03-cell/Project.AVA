import { generateDraftTrainingPlan } from "./engine";
import { TRAINING_PROGRAM_INPUT_VERSION, type TrainingProgramInput } from "./contracts";

const capturedAt="2026-07-18T12:00:00.000Z";
const provenance=(source:"athlete"|"coach"|"clinician"|"activated_snapshot"|"system",sourceId:string)=>({source,sourceId,capturedAt,confidence:.9});
export const TRAINING_PROGRAM_FIXTURE:TrainingProgramInput={
  contractVersion:TRAINING_PROGRAM_INPUT_VERSION,requestId:"11111111-1111-4111-8111-111111111111",
  ownerId:"22222222-2222-4222-8222-222222222222",athleteId:"33333333-3333-4333-8333-333333333333",
  sourceManifest:{id:"44444444-4444-4444-8444-444444444444",authoritative:true,status:"active",activatedAt:capturedAt},
  athlete:{ageCategory:"adult",trainingAgeYears:4,event:"100m",performanceLevel:"collegiate",preferredUnits:"metric"},
  objectives:[
    {id:"objective-maxv",category:"max_velocity",allocation:"primary",sourceRecommendationId:"rec-maxv",sourcePriorityId:"priority-maxv",sourceOptimizationId:"opt-maxv",sourceRootCauseId:null,associatedMuscleGroups:["hamstring group","gluteal group"],expectedBenefit:"Improve backend-identified maximal-velocity opportunity.",confidence:.85,urgency:.8,dependencies:[],conflicts:["objective-speed-endurance"],completionCriteria:["Coach review after two completed exposures"],contraindications:["acute pain"]},
    {id:"objective-accel",category:"acceleration",allocation:"secondary",sourceRecommendationId:"rec-accel",sourcePriorityId:"priority-accel",sourceOptimizationId:"opt-accel",sourceRootCauseId:null,associatedMuscleGroups:["gluteal group"],expectedBenefit:"Maintain acceleration while maximal velocity is primary.",confidence:.8,urgency:.6,dependencies:[],conflicts:[],completionCriteria:["Preserve technical quality"],contraindications:["acute pain"]},
    {id:"objective-maintenance",category:"maintenance",allocation:"maintenance",sourceRecommendationId:"rec-maintain",sourcePriorityId:"priority-maintain",sourceOptimizationId:null,sourceRootCauseId:null,associatedMuscleGroups:[],expectedBenefit:"Preserve low-intensity capacity.",confidence:.8,urgency:.3,dependencies:[],conflicts:[],completionCriteria:["Complete one controlled exposure"],contraindications:[]},
  ],
  upstream:{recommendationSnapshotId:"55555555-5555-4555-8555-555555555555",prioritySnapshotId:"66666666-6666-4666-8666-666666666666",optimizationSnapshotId:"77777777-7777-4777-8777-777777777777",coachingStateSnapshotId:"88888888-8888-4888-8888-888888888888",digitalTwinSnapshotId:"99999999-9999-4999-8999-999999999999"},
  context:{seasonPhase:"specific_preparation",startDate:"2026-07-20",availableWeekdays:[1,2,3,4,5,6],maximumSessionMinutes:100,facilities:["track","turf","weight_room"],equipment:["trap_bar"],preferredRestDays:[7]},
  competitions:[{id:"meet-1",date:"2026-07-25",event:"100m",importance:"preparation",travel:false,taperPriority:"minor"}],
  readiness:[{id:"readiness-1",type:"fatigue",severity:"low",affectedDomain:"general",observedAt:capturedAt,validUntil:"2026-07-27T12:00:00.000Z",provenance:provenance("athlete","check-in-1")}],
  restrictions:[],recentExposure:{sprintDistanceM:420,highSpeedDistanceM:100,accelerationDistanceM:180,plyometricContacts:40,strengthSessions:2,windowDays:7},
  history:{completedSessions:18,missedSessions:2,adverseResponses:0,lastUpdatedAt:capturedAt},
  requiredCoachApproval:true,operationalMetadata:{traceId:"trace-fixture",requestedAt:capturedAt},
};
export const generateTrainingProgramFixture=()=>generateDraftTrainingPlan(TRAINING_PROGRAM_FIXTURE,{
  planId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",createdAt:capturedAt,
});

