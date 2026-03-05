/**
 * Secret resolution for CI/CD jobs.
 *
 * Walks connections to find secret: pseudo-node references and wires
 * them into the appropriate jobs as environment variables.
 */

import type { TWorkflowAST } from '@synergenius/flow-weaver/ast';
import type { CICDJob, CICDStep } from './types.js';

/**
 * Resolve secret connections from the AST and attach them to jobs.
 *
 * For each `@connect secret:NAME -> node.port` connection, adds the secret
 * to the target job's secrets list and sets `step.env[PORT_NAME]` to the
 * platform-specific reference (e.g. `${{ secrets.NAME }}`).
 *
 * @param renderSecretRef Platform-specific renderer, e.g. `(name) => \`\${{ secrets.${name} }}\``
 */
export function resolveJobSecrets(
  jobs: CICDJob[],
  ast: TWorkflowAST,
  renderSecretRef: (name: string) => string,
): void {
  const nodeJob = new Map<string, string>();
  for (const inst of ast.instances) {
    nodeJob.set(inst.id, inst.job || 'default');
  }

  const stepMap = new Map<string, CICDStep>();
  for (const job of jobs) {
    for (const step of job.steps) {
      stepMap.set(step.id, step);
    }
  }

  for (const conn of ast.connections) {
    if (!conn.from.node.startsWith('secret:')) continue;

    const secretName = conn.from.node.substring(7);
    const targetNode = conn.to.node;
    const targetPort = conn.to.port;
    const jobId = nodeJob.get(targetNode);

    if (!jobId) continue;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) continue;

    if (!job.secrets.includes(secretName)) {
      job.secrets.push(secretName);
    }

    const step = stepMap.get(targetNode);
    if (step) {
      step.env = step.env || {};
      step.env[targetPort.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '')] =
        renderSecretRef(secretName);
    }
  }
}
