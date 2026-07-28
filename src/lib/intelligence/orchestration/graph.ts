import type { EngineRegistryEntry } from "../shared/contracts";
import type { DependencyGraph, EngineId } from "./contracts";

export class PipelineValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PipelineValidationError";
  }
}

export interface ValidatedGraph extends DependencyGraph {
  order: EngineId[];
  stages: EngineId[][];
}

/** Builds the executable DAG from registry predecessor metadata, never a local order list. */
export function validateRegistryGraph(
  registry: readonly EngineRegistryEntry[],
  targets?: readonly EngineId[],
): ValidatedGraph {
  const entries = new Map<string, EngineRegistryEntry>();
  for (const item of registry) {
    if (entries.has(item.engineId)) throw new PipelineValidationError("duplicate_engine", `Duplicate engine ${item.engineId}`);
    if (!item.contract.inputContract || !item.contract.outputContract)
      throw new PipelineValidationError("missing_contract", `Engine ${item.engineId} has an incomplete contract`);
    if (!item.engineVersion.trim()) throw new PipelineValidationError("unsupported_version", `Engine ${item.engineId} has no version`);
    const duplicate = item.dependencies.find((id, index) => item.dependencies.indexOf(id) !== index);
    if (duplicate) throw new PipelineValidationError("duplicate_dependency", `${item.engineId} repeats ${duplicate}`);
    entries.set(item.engineId, item);
  }
  for (const item of registry) {
    for (const id of item.dependencies)
      if (!entries.has(id)) throw new PipelineValidationError("missing_dependency", `${item.engineId} requires ${id}`);
    if (item.pipelinePredecessor && !entries.has(item.pipelinePredecessor))
      throw new PipelineValidationError("missing_engine", `${item.engineId} follows unknown ${item.pipelinePredecessor}`);
  }
  const selected = selectAncestors(entries, targets ?? [...entries.keys()]);
  const edges: Array<readonly [string, string]> = [];
  for (const item of registry)
    if (selected.has(item.engineId) && item.pipelinePredecessor && selected.has(item.pipelinePredecessor))
      edges.push([item.pipelinePredecessor, item.engineId]);
  const nodes = [...selected].sort();
  const indegree = new Map(nodes.map((id) => [id, 0]));
  const children = new Map(nodes.map((id) => [id, [] as string[]]));
  for (const [from, to] of edges) {
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    children.get(from)?.push(to);
  }
  const stages: string[][] = [];
  let ready = nodes.filter((id) => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length) {
    stages.push(ready);
    order.push(...ready);
    const next: string[] = [];
    for (const id of ready)
      for (const child of children.get(id) ?? []) {
        const value = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, value);
        if (value === 0) next.push(child);
      }
    ready = next.sort();
  }
  if (order.length !== nodes.length) throw new PipelineValidationError("cycle", "Engine registry contains a cycle");
  return { nodes, edges, order, stages };
}

function selectAncestors(entries: Map<string, EngineRegistryEntry>, targets: readonly string[]): Set<string> {
  const selected = new Set<string>();
  const visit = (id: string) => {
    const entry = entries.get(id);
    if (!entry) throw new PipelineValidationError("missing_engine", `Unknown target engine ${id}`);
    if (selected.has(id)) return;
    selected.add(id);
    if (entry.pipelinePredecessor) visit(entry.pipelinePredecessor);
  };
  targets.forEach(visit);
  return selected;
}

