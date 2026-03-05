/**
 * Job graph construction from a CI/CD workflow AST.
 *
 * Groups node instances by their [job: "name"] attribute, computes
 * inter-job dependencies from connections, applies @job/@stage config,
 * and returns a topologically sorted list of CICDJob objects.
 *
 * Extracted from core's BaseCICDTarget.buildJobGraph().
 */

import type {
  TWorkflowAST,
  TNodeTypeAST,
} from '@synergenius/flow-weaver/ast';
import type { CICDJob, CICDStep } from './types.js';

/**
 * Build the job graph from a workflow AST.
 * Returns jobs in topological order (dependencies first).
 */
export function buildJobGraph(ast: TWorkflowAST): CICDJob[] {
  const nodeTypeLookup = new Map<string, TNodeTypeAST>();
  for (const nt of ast.nodeTypes) {
    nodeTypeLookup.set(nt.name, nt);
    if (nt.functionName !== nt.name) nodeTypeLookup.set(nt.functionName, nt);
  }

  const jobMap = new Map<string, import('@synergenius/flow-weaver/ast').TNodeInstanceAST[]>();
  const defaultRunner = ast.options?.cicd?.runner;

  for (const inst of ast.instances) {
    const jobName = inst.job || 'default';
    if (!jobMap.has(jobName)) jobMap.set(jobName, []);
    jobMap.get(jobName)!.push(inst);
  }

  const nodeJob = new Map<string, string>();
  for (const inst of ast.instances) {
    nodeJob.set(inst.id, inst.job || 'default');
  }

  const jobDeps = new Map<string, Set<string>>();
  for (const conn of ast.connections) {
    if (conn.from.node.startsWith('secret:')) continue;
    if (conn.from.node === 'Start' || conn.to.node === 'Exit') continue;

    const fromJob = nodeJob.get(conn.from.node);
    const toJob = nodeJob.get(conn.to.node);

    if (fromJob && toJob && fromJob !== toJob) {
      if (!jobDeps.has(toJob)) jobDeps.set(toJob, new Set());
      jobDeps.get(toJob)!.add(fromJob);
    }
  }

  const jobs: CICDJob[] = [];
  for (const [jobId, instances] of jobMap) {
    const environment = instances.find((i) => i.environment)?.environment;

    const steps: CICDStep[] = instances.map((inst) => {
      const nt = nodeTypeLookup.get(inst.nodeType);
      return {
        id: inst.id,
        name: inst.config?.label || inst.id,
        nodeType: inst.nodeType,
        ...(nt?.deploy && { nodeTypeDeploy: nt.deploy }),
      };
    });

    const needs = jobDeps.get(jobId)
      ? Array.from(jobDeps.get(jobId)!)
      : [];

    jobs.push({
      id: jobId,
      name: jobId,
      runner: defaultRunner,
      needs,
      steps,
      environment,
      secrets: [],
    });
  }

  // Apply @job configs
  const jobConfigs = ast.options?.cicd?.jobs;
  if (jobConfigs) {
    for (const jc of jobConfigs) {
      const job = jobs.find(j => j.id === jc.id);
      if (!job) continue;
      if (jc.retry !== undefined) job.retry = jc.retry;
      if (jc.allowFailure !== undefined) job.allowFailure = jc.allowFailure;
      if (jc.timeout) job.timeout = jc.timeout;
      if (jc.variables) job.variables = { ...job.variables, ...jc.variables };
      if (jc.tags) job.tags = jc.tags;
      if (jc.beforeScript) job.beforeScript = jc.beforeScript;
      if (jc.rules) job.rules = jc.rules;
      if (jc.coverage) job.coverage = jc.coverage;
      if (jc.reports) job.reports = jc.reports;
      if (jc.runner) job.runner = jc.runner;
      if (jc.extends) job.extends = jc.extends;
    }
  }

  // Apply @stage assignments
  const stages = ast.options?.cicd?.stages;
  if (stages && stages.length > 0) {
    const depthMap = computeJobDepths(jobs);

    for (const job of jobs) {
      if (!job.stage) {
        for (const s of stages) {
          if (job.id === s.name || job.id.startsWith(s.name + '-') || job.id.startsWith(s.name + '_')) {
            job.stage = s.name;
            break;
          }
        }
      }
    }

    for (const job of jobs) {
      if (!job.stage) {
        const depth = depthMap.get(job.id) || 0;
        job.stage = stages[Math.min(depth, stages.length - 1)].name;
      }
    }
  }

  // Apply workflow-level defaults
  const cicd = ast.options?.cicd;
  if (cicd) {
    for (const job of jobs) {
      if (cicd.variables && !job.variables) {
        job.variables = { ...cicd.variables };
      }
      if (cicd.beforeScript && !job.beforeScript) {
        job.beforeScript = [...cicd.beforeScript];
      }
      if (cicd.tags && !job.tags) {
        job.tags = [...cicd.tags];
      }
    }
  }

  return topoSortJobs(jobs);
}

function topoSortJobs(jobs: CICDJob[]): CICDJob[] {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const visited = new Set<string>();
  const sorted: CICDJob[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const job = jobMap.get(id);
    if (!job) return;
    for (const dep of job.needs) {
      visit(dep);
    }
    sorted.push(job);
  }

  for (const job of jobs) {
    visit(job.id);
  }

  return sorted;
}

function computeJobDepths(jobs: CICDJob[]): Map<string, number> {
  const depths = new Map<string, number>();

  function depth(jobId: string, visited: Set<string>): number {
    if (depths.has(jobId)) return depths.get(jobId)!;
    if (visited.has(jobId)) return 0;
    visited.add(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.needs.length === 0) {
      depths.set(jobId, 0);
      return 0;
    }
    const maxDep = Math.max(...job.needs.map(n => depth(n, visited)));
    const d = maxDep + 1;
    depths.set(jobId, d);
    return d;
  }

  for (const job of jobs) {
    depth(job.id, new Set());
  }

  return depths;
}
