/**
 * CI/CD Runtime Code Generator
 *
 * Takes a workflow AST and a job graph, produces a self-contained TypeScript
 * CLI file that can be executed per-job via `npx tsx <file> --job=<id>`.
 *
 * Each CI/CD job function calls the real node type implementations (execSync,
 * fetch, etc.) in topological order. Cross-job data flows through a JSON-based
 * artifact directory (.fw-artifacts/).
 *
 * Follows the same resolvePortValue / buildNodeArgs pattern as the Inngest
 * generator, but targets sequential per-job execution instead of durable steps.
 */

import type { TNodeTypeAST, TWorkflowAST } from '@synergenius/flow-weaver/ast';
import {
  toValidIdentifier,
  buildControlFlowGraph,
  performKahnsTopologicalSort,
} from '@synergenius/flow-weaver/generator';
import {
  isStartNode,
  isExitNode,
  isExecutePort,
} from '@synergenius/flow-weaver/constants';
import type { CICDJob } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CICDGenerationOptions {
  /** Workflow base name (used in comments, defaults to workflow.functionName) */
  workflowName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a node type for an instance by checking both name and functionName.
 */
function getNodeType(
  instanceId: string,
  workflow: TWorkflowAST,
  nodeTypes: TNodeTypeAST[],
): TNodeTypeAST | undefined {
  const instance = workflow.instances.find((i) => i.id === instanceId);
  if (!instance) return undefined;
  return nodeTypes.find(
    (nt) => nt.name === instance.nodeType || nt.functionName === instance.nodeType,
  );
}

/**
 * Resolve a port's value source for a given node instance.
 *
 * Returns a plain JS expression referencing local variables produced by
 * earlier calls in the same job function.
 *
 * For Start connections: `params.portName` (from CLI params or job config).
 * For cross-job connections (source outside current job): `readArtifact(...)`.
 * For within-job connections: `safeSource_result.portName`.
 */
function resolvePortValue(
  portName: string,
  instanceId: string,
  nodeType: TNodeTypeAST,
  workflow: TWorkflowAST,
  _nodeTypes: TNodeTypeAST[],
  jobNodeSet: Set<string>,
): string {
  const safeId = toValidIdentifier(instanceId);
  const portDef = nodeType.inputs[portName];
  const instance = workflow.instances.find((i) => i.id === instanceId);

  // Instance-level expression override
  const instancePortConfig = instance?.config?.portConfigs?.find(
    (pc) => pc.portName === portName && (pc.direction == null || pc.direction === 'INPUT'),
  );
  if (instancePortConfig?.expression !== undefined) {
    const expr = String(instancePortConfig.expression);
    const isFunction = expr.includes('=>') || expr.trim().startsWith('function');
    if (isFunction) {
      return `await (${expr})()`;
    }
    return expr;
  }

  // Check for connections
  const connections = workflow.connections.filter(
    (conn) =>
      conn.to.node === instanceId &&
      conn.to.port === portName &&
      !conn.from.scope &&
      !conn.to.scope,
  );

  if (connections.length > 0) {
    if (connections.length === 1) {
      const conn = connections[0];
      const sourceNode = conn.from.node;
      const sourcePort = conn.from.port;

      if (isStartNode(sourceNode)) {
        return `params.${sourcePort}`;
      }

      // Cross-job connection: source is in a different job
      if (!jobNodeSet.has(sourceNode)) {
        const sourceJob = workflow.instances.find((i) => i.id === sourceNode)?.job || 'default';
        return `readArtifact('${sourceJob}', '${sourcePort}')`;
      }

      const safeSource = toValidIdentifier(sourceNode);
      return `${safeSource}_result.${sourcePort}`;
    }

    // Multiple connections: fan-in, use first non-undefined
    const attempts = connections.map((conn) => {
      const sourceNode = conn.from.node;
      const sourcePort = conn.from.port;
      if (isStartNode(sourceNode)) {
        return `params.${sourcePort}`;
      }
      if (!jobNodeSet.has(sourceNode)) {
        const sourceJob = workflow.instances.find((i) => i.id === sourceNode)?.job || 'default';
        return `readArtifact('${sourceJob}', '${sourcePort}')`;
      }
      const safeSource = toValidIdentifier(sourceNode);
      return `${safeSource}_result?.${sourcePort}`;
    });
    return attempts.join(' ?? ');
  }

  // Node type expression
  if (portDef?.expression) {
    const expr = portDef.expression;
    const isFunction = expr.includes('=>') || expr.trim().startsWith('function');
    if (isFunction) {
      return `await (${expr})()`;
    }
    return expr;
  }

  // Default value
  if (portDef?.default !== undefined) {
    return JSON.stringify(portDef.default);
  }

  // Optional port
  if (portDef?.optional) {
    return 'undefined';
  }

  return `undefined /* no source for ${safeId}.${portName} */`;
}

/**
 * Build the argument list for calling a node function.
 * All CI/CD node types are expression nodes (no execute port), so we only
 * handle data ports.
 */
function buildNodeArgs(
  instanceId: string,
  nodeType: TNodeTypeAST,
  workflow: TWorkflowAST,
  nodeTypes: TNodeTypeAST[],
  jobNodeSet: Set<string>,
): string[] {
  const args: string[] = [];

  for (const portName of Object.keys(nodeType.inputs)) {
    if (isExecutePort(portName)) continue;
    if (nodeType.inputs[portName].scope) continue;

    const value = resolvePortValue(portName, instanceId, nodeType, workflow, nodeTypes, jobNodeSet);
    args.push(value);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Function Body Extraction
// ---------------------------------------------------------------------------

/**
 * Strip the JSDoc comment from a function's source text.
 * Returns just the function declaration + body.
 */
function stripJSDoc(functionText: string): string {
  return functionText.replace(/\/\*\*[\s\S]*?\*\/\s*/g, '').trim();
}

/**
 * Extract import statements that a function body depends on.
 * Scans for common Node.js built-in imports used by the real implementations.
 */
function extractRequiredImports(functionText: string): string[] {
  const imports: string[] = [];

  // Detect which node:* modules are referenced
  if (functionText.includes('execSync')) {
    imports.push("import { execSync } from 'node:child_process';");
  }
  if (functionText.includes('fs.') || functionText.includes("from 'node:fs'")) {
    imports.push("import * as fs from 'node:fs';");
  }
  if (functionText.includes('os.') || functionText.includes("from 'node:os'")) {
    imports.push("import * as os from 'node:os';");
  }
  if (functionText.includes('path.') || functionText.includes("from 'node:path'")) {
    imports.push("import * as path from 'node:path';");
  }

  return imports;
}

// ---------------------------------------------------------------------------
// Job Code Generation
// ---------------------------------------------------------------------------

/**
 * Generate the body of a single job function.
 * Topologically sorts nodes within the job, resolves inputs, and emits calls.
 */
function generateJobFunction(
  job: CICDJob,
  workflow: TWorkflowAST,
  nodeTypes: TNodeTypeAST[],
): string[] {
  const lines: string[] = [];
  const indent = '  ';
  const jobNodeIds = new Set(job.steps.map((s) => s.id));

  // Build a sub-graph for this job's nodes and sort them
  const cfg = buildControlFlowGraph(workflow, nodeTypes);
  const fullOrder = performKahnsTopologicalSort(cfg);
  const jobOrder = fullOrder.filter((n) => jobNodeIds.has(n));

  for (const nodeId of jobOrder) {
    const nodeType = getNodeType(nodeId, workflow, nodeTypes);
    if (!nodeType) continue;

    const safeId = toValidIdentifier(nodeId);
    const args = buildNodeArgs(nodeId, nodeType, workflow, nodeTypes, jobNodeIds);
    const fnCall = `${nodeType.functionName}(${args.join(', ')})`;
    const awaitPrefix = nodeType.isAsync ? 'await ' : '';

    lines.push(`${indent}const ${safeId}_result = ${awaitPrefix}${fnCall};`);
    lines.push(`${indent}console.log('[${job.id}] ${nodeId}:', JSON.stringify(${safeId}_result));`);
  }

  // Write artifacts for outputs consumed by downstream jobs
  const outputConns = workflow.connections.filter(
    (conn) =>
      jobNodeIds.has(conn.from.node) &&
      !isExitNode(conn.to.node) &&
      !jobNodeIds.has(conn.to.node) &&
      !conn.from.scope &&
      !conn.to.scope,
  );

  if (outputConns.length > 0) {
    const seen = new Set<string>();
    for (const conn of outputConns) {
      const key = `${conn.from.node}:${conn.from.port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const safeSource = toValidIdentifier(conn.from.node);
      lines.push(
        `${indent}writeArtifact('${job.id}', '${conn.from.port}', ${safeSource}_result.${conn.from.port});`,
      );
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained CI/CD runtime TypeScript file.
 *
 * The output is a CLI script that accepts `--job=<id>` and executes
 * that job's nodes sequentially. Cross-job data flows through JSON
 * artifact files in `.fw-artifacts/`.
 *
 * @param workflow - The workflow AST
 * @param jobs - Job graph (from buildJobGraph)
 * @param nodeTypes - All available node type definitions
 * @param options - Optional generation config
 * @returns Complete TypeScript source code string
 */
export function generateCICDRuntime(
  workflow: TWorkflowAST,
  jobs: CICDJob[],
  nodeTypes: TNodeTypeAST[],
  options?: CICDGenerationOptions,
): string {
  const workflowName = options?.workflowName ?? workflow.functionName;
  const lines: string[] = [];

  lines.push('#!/usr/bin/env node');
  lines.push(`// CI/CD runtime for workflow: ${workflowName}`);
  lines.push(`// Generated by Flow Weaver CI/CD pack`);
  lines.push('');

  // -- Collect all imports needed by inlined function bodies --
  const allImports = new Set<string>();
  allImports.add("import * as fs from 'node:fs';"); // always needed for artifact I/O

  const inlinedFunctions = new Set<string>();
  const functionBodies = new Map<string, string>();

  for (const instance of workflow.instances) {
    if (isStartNode(instance.id) || isExitNode(instance.id)) continue;
    const nt = nodeTypes.find(
      (n) => n.name === instance.nodeType || n.functionName === instance.nodeType,
    );
    if (!nt || inlinedFunctions.has(nt.functionName)) continue;
    inlinedFunctions.add(nt.functionName);

    if (nt.functionText) {
      const stripped = stripJSDoc(nt.functionText);
      functionBodies.set(nt.functionName, stripped);
      for (const imp of extractRequiredImports(nt.functionText)) {
        allImports.add(imp);
      }
    }
  }

  // -- Emit imports --
  for (const imp of allImports) {
    lines.push(imp);
  }
  lines.push('');

  // -- Artifact I/O helpers --
  lines.push('// -- Artifact I/O (cross-job data transfer) --');
  lines.push("const ARTIFACT_DIR = '.fw-artifacts';");
  lines.push('');
  lines.push('function writeArtifact(jobId: string, key: string, value: unknown): void {');
  lines.push('  const dir = `${ARTIFACT_DIR}/${jobId}`;');
  lines.push("  fs.mkdirSync(dir, { recursive: true });");
  lines.push("  fs.writeFileSync(`${dir}/${key}.json`, JSON.stringify(value));");
  lines.push('}');
  lines.push('');
  lines.push('function readArtifact<T>(jobId: string, key: string): T {');
  lines.push("  return JSON.parse(fs.readFileSync(`${ARTIFACT_DIR}/${jobId}/${key}.json`, 'utf-8'));");
  lines.push('}');
  lines.push('');

  // -- Inlined node functions --
  lines.push('// -- Node functions --');
  for (const [fnName, body] of functionBodies) {
    // Strip any import statements from the function body (they're at the top level already)
    const cleanBody = body
      .replace(/^import\s+.*?;\s*$/gm, '')
      .trim();
    lines.push(cleanBody);
    lines.push('');
  }

  // -- Per-job execution functions --
  lines.push('// -- Per-job execution --');
  for (const job of jobs) {
    const safeName = toValidIdentifier(job.id);
    lines.push(`async function job_${safeName}(params: Record<string, unknown> = {}): Promise<void> {`);
    const bodyLines = generateJobFunction(job, workflow, nodeTypes);
    lines.push(...bodyLines);
    lines.push('}');
    lines.push('');
  }

  // -- CLI entry --
  lines.push('// -- CLI entry --');
  lines.push("const jobArg = process.argv.find(a => a.startsWith('--job='))?.split('=')[1];");
  lines.push("if (!jobArg) { console.error('Usage: --job=<id>'); process.exit(1); }");
  lines.push('');
  lines.push('const jobs: Record<string, (params?: Record<string, unknown>) => Promise<void>> = {');
  for (const job of jobs) {
    const safeName = toValidIdentifier(job.id);
    lines.push(`  '${job.id}': job_${safeName},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('const fn = jobs[jobArg];');
  lines.push("if (!fn) { console.error(`Unknown job: ${jobArg}. Available: ${Object.keys(jobs).join(', ')}`); process.exit(1); }");
  lines.push('fn().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });');
  lines.push('');

  return lines.join('\n');
}
