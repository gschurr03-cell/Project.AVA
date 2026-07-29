const PROHIBITED=[
  /\byour (?:hamstrings|calves|glutes|hip flexors|quadriceps|adductors|core) (?:are|is) weak\b/i,
  /\b(?:caused|causes) (?:this|your)\b/i,/\byou have an imbalance\b/i,/\bguaranteed?\b/i,
  /\bwill prevent injury\b/i,/\breturn[- ]to[- ]play cleared\b/i,/\bdiagnos(?:e|is)\b/i,
];
export function auditScientificLanguage(value:unknown){
  const text=JSON.stringify(value),matches=PROHIBITED.filter(x=>x.test(text)).map(String);
  return{safe:matches.length===0,prohibitedMatches:matches};
}
export function assertScientificLanguage(value:unknown){
  const audit=auditScientificLanguage(value);if(!audit.safe)throw new Error(`prohibited_scientific_language:${audit.prohibitedMatches.join(",")}`);
}

