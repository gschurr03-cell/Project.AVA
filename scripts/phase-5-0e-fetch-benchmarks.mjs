import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase environment");

const db = createClient(url, key, { auth: { persistSession: false } });
const registry = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    "validation/stationary-validation-registry.json",
    "utf8",
  ),
);
const outDir = path.resolve("tmp/phase50e/sources");
await mkdir(outDir, { recursive: true });

for (const benchmark of registry.benchmarks) {
  const output = path.join(outDir, `${benchmark.benchmarkKey}.mov`);
  const { data, error } = await db.storage
    .from(process.env.VIDEO_BUCKET ?? "sprint-videos")
    .download(benchmark.storagePath);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  await writeFile(output, bytes, { mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ benchmark: benchmark.benchmarkKey, output, bytes: bytes.length })}\n`,
  );
}
