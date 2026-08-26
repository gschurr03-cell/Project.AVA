import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sessions = {
  gav: "e04a7983-7406-4a00-bb89-8ada7b10bf9f",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
};
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("sessions").select("id,calibration_gates").in("id", Object.values(sessions));
if (error) throw error;
const byId = new Map(data.map((row) => [row.id, row.calibration_gates]));
const output = Object.fromEntries(Object.entries(sessions).map(([name,id]) => [name, { sessionId:id, calibrationGates:byId.get(id) }]));
mkdirSync("tmp/phase62", { recursive: true });
writeFileSync("tmp/phase62/calibrations.json", JSON.stringify(output, null, 2) + "\n");
console.log("wrote tmp/phase62/calibrations.json");
