import{z}from"zod";
export const sharedConfidenceLevelSchema=z.enum(["High","Moderate","Low","Insufficient"]);
export type SharedConfidenceLevel=z.infer<typeof sharedConfidenceLevelSchema>;
export const CONFIDENCE_THRESHOLDS_100=Object.freeze({high:75,moderate:55,low:30});
export function confidenceLevel100(score:number):SharedConfidenceLevel{
  return score>=CONFIDENCE_THRESHOLDS_100.high?"High":
    score>=CONFIDENCE_THRESHOLDS_100.moderate?"Moderate":
      score>=CONFIDENCE_THRESHOLDS_100.low?"Low":"Insufficient";
}
export const clampConfidence01=(value:number)=>Math.min(1,Math.max(0,value));
export const clampConfidence100=(value:number)=>Math.min(100,Math.max(0,value));
