export function summarizeAgreement(observed:number[],reference:number[]){
  if(!observed.length||observed.length!==reference.length)throw new Error("paired_samples_required");
  const errors=observed.map((value,index)=>value-reference[index]);
  const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
  const median=(values:number[])=>{const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  const bias=mean(errors),absolute=errors.map(Math.abs);
  const variance=errors.length>1?errors.reduce((sum,x)=>sum+(x-bias)**2,0)/(errors.length-1):0;
  const sd=Math.sqrt(variance);
  return{n:errors.length,bias,mae:mean(absolute),medianAbsoluteError:median(absolute),
    rmse:Math.sqrt(mean(errors.map(x=>x*x))),limitsOfAgreement:{lower:bias-1.96*sd,upper:bias+1.96*sd},
    errors};
}
export function summarizeDetection(input:{truePositive:number;falsePositive:number;falseNegative:number}){
  const precision=input.truePositive/(input.truePositive+input.falsePositive)||0;
  const recall=input.truePositive/(input.truePositive+input.falseNegative)||0;
  return{...input,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0};
}

