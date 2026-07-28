/** Stable FNV-1a over JSON. Preserve input ordering explicitly at call sites. */
export function stableHashHex(value:unknown):string{
  const text=JSON.stringify(value);let hash=2166136261;
  for(let index=0;index<text.length;index+=1){
    hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619);
  }
  return(hash>>>0).toString(16).padStart(8,"0");
}
export const stableFingerprint=(value:unknown)=>`fnv1a-${stableHashHex(value)}`;
