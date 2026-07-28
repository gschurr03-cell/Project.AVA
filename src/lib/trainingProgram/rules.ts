export const TRAINING_RULES = Object.freeze([
  {id:"TPI-ELIG-001",category:"eligibility",version:1,severity:"blocking",description:"An authoritative active manifest is required."},
  {id:"TPI-SAFE-PAIN-001",category:"safety",version:1,severity:"blocking",description:"Acute pain blocks high-intensity planning."},
  {id:"TPI-REST-MAXV-001",category:"recovery",version:1,severity:"blocking",description:"Maximal-velocity sessions require at least 48 hours separation."},
  {id:"TPI-HI-WEEK-001",category:"exposure",version:1,severity:"blocking",description:"The fixture supports at most three high-intensity days."},
  {id:"TPI-COMP-001",category:"competition",version:1,severity:"blocking",description:"Competition day is protected from training sessions."},
  {id:"TPI-DURATION-001",category:"validation",version:1,severity:"blocking",description:"Session duration cannot exceed athlete availability."},
  {id:"TPI-CATALOG-001",category:"catalog",version:1,severity:"blocking",description:"All exercises must be approved catalog versions."},
  {id:"TPI-APPROVAL-001",category:"approval",version:1,severity:"blocking",description:"Draft plans require configured human approval."},
  {id:"TPI-PROGRESS-001",category:"progression",version:1,severity:"review",description:"Progression requires completion, quality and no adverse response."},
] as const);
export const TRAINING_RULE_PRECEDENCE = Object.freeze([
  "clinician_restriction","hard_safety","acute_symptom","competition","coach_restriction",
  "facility_schedule","readiness","primary_objective","secondary_objective","maintenance","preference","variation",
] as const);
export function trainingRule(id:string){
  const rule=TRAINING_RULES.find(item=>item.id===id);
  if(!rule)throw new Error(`Unknown training rule ${id}`);
  return rule;
}
