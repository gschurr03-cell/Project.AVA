"use client";
import { useEffect } from "react";
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{
    // Surface the actual failure instead of an opaque {} — include the name and
    // message, and, for a ZodError, its structured `issues` (e.g. the failing
    // path like ["context","generatedAt"] and the validation code). In production
    // Next replaces the message with `digest`; the full stack is logged server-side.
    const detail:Record<string,unknown>={name:error.name,message:error.message,digest:error.digest};
    const issues=(error as unknown as {issues?:unknown}).issues;
    if(issues!==undefined)detail.issues=issues;
    console.error("route_error",detail);
  },[error]);
  return <main className="ava-carbon grid min-h-screen place-items-center p-8 text-white"><div className="max-w-md rounded-xl border border-white/10 bg-[#151518] p-6"><h1 className="text-xl font-bold">AVA couldn&apos;t load this view</h1><p className="mt-2 text-sm text-[#b3bccb]">Your data was not changed. Retry, or return to the dashboard.</p>{error.digest&&<p className="mt-3 font-mono text-xs text-[#7e8797]">Diagnostic {error.digest}</p>}<div className="mt-5 flex gap-2"><button onClick={reset} className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold">Retry</button><a href="/dashboard" className="rounded-lg border border-white/10 px-4 py-2 text-sm">Dashboard</a></div></div></main>;
}
