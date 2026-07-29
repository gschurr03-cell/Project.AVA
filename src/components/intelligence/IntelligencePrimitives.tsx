import type{ReactNode}from"react";
export function IntelligenceStat({label,value}:{label:string;value:string}){
  return <div className="rounded-xl border border-white/10 bg-[#182233] p-4">
    <p className="text-xs text-[#7e8797]">{label}</p><p className="mt-2 font-semibold">{value}</p>
  </div>;
}
export function IntelligencePanel({title,children,titleSpacing="mb-3"}:{
  title:string;children:ReactNode;titleSpacing?:"mb-3"|"mb-4";
}){
  return <section className="rounded-2xl border border-white/10 bg-[#101827] p-5">
    <h2 className={`${titleSpacing} font-semibold`}>{title}</h2>{children}
  </section>;
}
export function IntelligenceEmpty({children="No cached item."}:{children?:ReactNode}){
  return <p className="text-sm text-[#7e8797]">{children}</p>;
}
