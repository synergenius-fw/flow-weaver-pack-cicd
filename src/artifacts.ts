/**
 * Artifact injection for cross-job data flow.
 *
 * When jobs depend on each other, artifacts need to be uploaded after the
 * upstream job and downloaded before the downstream job runs.
 */

import type { TCICDArtifact } from '@synergenius/flow-weaver/ast';
import type { CICDJob } from './types.js';

/**
 * Inject upload/download artifact steps into jobs that have cross-job dependencies.
 */
export function injectArtifactSteps(jobs: CICDJob[], artifacts: TCICDArtifact[]): void {
  if (artifacts.length === 0) return;

  for (const job of jobs) {
    if (job.needs.length === 0) continue;

    const neededJobs = jobs.filter((j) => job.needs.includes(j.id));
    for (const needed of neededJobs) {
      const jobArtifacts = artifacts.filter(
        (a) => !a.name || needed.steps.some((s) => s.nodeType === a.name),
      );

      if (jobArtifacts.length > 0) {
        needed.uploadArtifacts = (needed.uploadArtifacts || []).concat(jobArtifacts);
        job.downloadArtifacts = (job.downloadArtifacts || []).concat(
          jobArtifacts.map((a) => a.name),
        );
      }
    }
  }
}
