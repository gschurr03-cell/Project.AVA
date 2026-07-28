export function safeReturnTo(value: unknown, fallback="/dashboard"){
  const path=String(value??"");
  return path.startsWith("/")&&!path.startsWith("//")&&!path.includes("\\") ? path : fallback;
}
