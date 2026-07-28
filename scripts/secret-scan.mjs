import { execFileSync } from "node:child_process";

const tracked=execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(Boolean)
  .filter(file=>!file.endsWith("package-lock.json")&&!file.includes("scripts/secret-scan.mjs"));
const patterns=[
  {name:"private_key",expression:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:"github_token",expression:/gh[pousr]_[A-Za-z0-9_]{30,}/},
  {name:"supabase_service_jwt",expression:/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/},
  {name:"hardcoded_service_secret",expression:/(?:SUPABASE_SERVICE_ROLE_KEY|ANALYSIS_WORKER_SECRET)\s*=\s*['"]?[^\s'"]{20,}/},
];
const findings=[];
for(const file of tracked){
  let content;try{content=execFileSync("git",["show",`HEAD:${file}`],{encoding:"utf8",maxBuffer:10_000_000});}catch{continue;}
  for(const pattern of patterns)if(pattern.expression.test(content))findings.push(`${file}:${pattern.name}`);
}
if(findings.length){console.error(`Potential committed secrets:\n${findings.join("\n")}`);process.exit(1);}
console.log("secret scan: passed");
