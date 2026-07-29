# Root Cause Causal Network

The network is a directed evidence-linked acyclic graph. Each edge stores relationship
type, confidence, evidence, historical support, research support, unknowns, and source
version.

Nodes must have candidates in the same input. Missing nodes, self-edges, and cycles fail
closed. RCI does not infer an edge from limiter names, taxonomy ordering, or generic
biomechanics knowledge. Benchmark and research evidence can adjust confidence but cannot
independently confirm cause.
