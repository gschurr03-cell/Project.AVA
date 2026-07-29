import { approvedExercise } from "./catalog";
import type { PlanSession, TrainingObjective, TrainingProgramInput } from "./contracts";
import { classifyExerciseSafety } from "./safety";
import { trainingSessionTemplate } from "./templates";

export type ExerciseSelectionTrace={slot:string;selectedExerciseId:string;alternativeIds:string[];
  reasons:string[];sourceIds:string[]};
export function buildSessionFromTemplate(input:{
  templateId:string;sessionId:string;weekday:number;objective:TrainingObjective;
  programInput:TrainingProgramInput;historicalUsage:Record<string,number>;enabledAdvancedFeatures:Set<string>;
}):{session:PlanSession;trace:ExerciseSelectionTrace[]}{
  const template=trainingSessionTemplate(input.templateId);
  if(!template.compatibleObjectives.includes(input.objective.category))
    throw new Error(`template_objective_incompatible:${template.id}:${input.objective.category}`);
  if(template.requiredFacilities.some(item=>!input.programInput.context.facilities.includes(item as never)))
    throw new Error(`template_facility_unavailable:${template.id}`);
  const trace:ExerciseSelectionTrace[]=[];
  const exercises=template.blocks.flatMap(block=>{
    const candidates=block.exerciseIds.map(approvedExercise).filter(item=>
      item.objectives.includes(input.objective.category)||
      ["warm_up","recovery","mobility"].includes(item.category))
      .filter(item=>item.facilities.every(facility=>input.programInput.context.facilities.includes(facility as never)))
      .filter(item=>item.equipment.every(equipment=>input.programInput.context.equipment.includes(equipment)))
      .filter(item=>item.minimumTrainingAgeYears<=input.programInput.athlete.trainingAgeYears)
      .filter(item=>!item.advancedFeatureGate||input.enabledAdvancedFeatures.has(item.advancedFeatureGate))
      .filter(item=>classifyExerciseSafety(item,input.programInput).status==="permitted")
      .sort((a,b)=>(input.historicalUsage[a.id]??0)-(input.historicalUsage[b.id]??0)||a.id.localeCompare(b.id));
    if(block.required&&!candidates.length)throw new Error(`required_template_slot_unfilled:${template.id}:${block.kind}`);
    return candidates.slice(0,block.maximumSelections).map(item=>{
      trace.push({slot:block.kind,selectedExerciseId:item.id,
        alternativeIds:candidates.filter(candidate=>candidate.id!==item.id).map(candidate=>candidate.id),
        reasons:["objective_match","facility_equipment_available","restriction_permitted","lowest_recent_usage_then_stable_id"],
        sourceIds:[input.objective.sourceRecommendationId,input.objective.sourcePriorityId,item.id]});
      return{exerciseId:item.id,catalogVersion:item.version,dosage:item.defaultDosage,
        objectiveIds:[input.objective.id],
        rationale:`Selected for ${input.objective.category}; compatible and lowest recent usage among safe alternatives.`,
        ruleIds:["TPI-CATALOG-001"]};
    });
  });
  const type=template.type;
  return{session:{id:input.sessionId,weekday:input.weekday,type,
    templateId:template.id,durationMinutes:Math.min(template.estimatedDurationMinutes,input.programInput.context.maximumSessionMinutes),
    objectiveIds:[input.objective.id],exercises,
    highIntensity:["acceleration","max_velocity","speed_endurance","competition","testing"].includes(type),
    rationale:`Template ${template.id} serves activated objective ${input.objective.id}.`,
    ruleIds:["TPI-DURATION-001","TPI-CATALOG-001"]},trace};
}
