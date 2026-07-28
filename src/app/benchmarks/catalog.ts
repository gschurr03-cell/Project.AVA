import { z } from "zod";
import { benchmarkDatasetSchema } from "@/lib/benchmarkEngine";

export const benchmarkCatalogSchema = z.object({
  datasets: z.array(z.object({
    id:z.string(),datasetKey:z.string(),datasetVersion:z.string(),datasetName:z.string(),
    comparisonLevel:z.string(),reviewStatus:z.string(),verified:z.boolean(),active:z.boolean(),
    contract:benchmarkDatasetSchema,updatedAt:z.string(),
  })),
  auditEvents:z.number(),
});
