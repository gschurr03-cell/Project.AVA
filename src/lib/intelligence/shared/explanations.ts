export type DeterministicTemplate<T extends Record<string,unknown>>=(fields:T)=>string;
export function renderDeterministicTemplate<T extends Record<string,unknown>>(
  registry:Record<string,DeterministicTemplate<T>>,key:string,fields:T,
):string{
  const template=registry[key];
  if(!template)throw new Error(`Unknown deterministic explanation template: ${key}`);
  return template(fields);
}
