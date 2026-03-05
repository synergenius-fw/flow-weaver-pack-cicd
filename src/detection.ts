/**
 * CI/CD workflow detection utilities.
 *
 * Determines whether a workflow AST represents a CI/CD pipeline based
 * on the presence of CI/CD annotations (@secret, @runner, @job, etc.).
 */

import type { TWorkflowAST } from '@synergenius/flow-weaver/ast';

/**
 * Check if a workflow is a CI/CD pipeline.
 *
 * Detection signals (any one is sufficient):
 * 1. Workflow options contain CI/CD fields (secrets, runner, caches, etc.)
 * 2. Any node instance has a `job` attribute
 */
export function isCICDWorkflow(ast: TWorkflowAST): boolean {
  const cicd = ast.options?.cicd;
  if (cicd) {
    if (cicd.secrets && cicd.secrets.length > 0) return true;
    if (cicd.runner) return true;
    if (cicd.caches && cicd.caches.length > 0) return true;
    if (cicd.artifacts && cicd.artifacts.length > 0) return true;
    if (cicd.environments && cicd.environments.length > 0) return true;
    if (cicd.matrix) return true;
    if (cicd.services && cicd.services.length > 0) return true;
    if (cicd.concurrency) return true;
    if (cicd.triggers && cicd.triggers.length > 0) return true;
    if (cicd.jobs && cicd.jobs.length > 0) return true;
    if (cicd.variables && Object.keys(cicd.variables).length > 0) return true;
    if (cicd.beforeScript && cicd.beforeScript.length > 0) return true;
    if (cicd.tags && cicd.tags.length > 0) return true;
    if (cicd.includes && cicd.includes.length > 0) return true;
    if (cicd.stages && cicd.stages.length > 0) return true;
  }

  if (ast.instances.some((inst) => inst.job)) return true;

  return false;
}

/**
 * Get all unique job names from a CI/CD workflow.
 */
export function getJobNames(ast: TWorkflowAST): string[] {
  const jobs = new Set<string>();
  for (const inst of ast.instances) {
    if (inst.job) jobs.add(inst.job);
  }
  return Array.from(jobs);
}

/**
 * Get all declared secret names from a CI/CD workflow.
 */
export function getDeclaredSecrets(ast: TWorkflowAST): string[] {
  return (ast.options?.cicd?.secrets || []).map((s) => s.name);
}

/**
 * Get all secret:NAME references from connections.
 */
export function getReferencedSecrets(ast: TWorkflowAST): string[] {
  const secrets = new Set<string>();
  for (const conn of ast.connections) {
    if (conn.from.node.startsWith('secret:')) {
      secrets.add(conn.from.node.substring(7));
    }
  }
  return Array.from(secrets);
}
