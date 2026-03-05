/**
 * CI/CD runtime types used by the job graph builder, compile target,
 * and platform-specific export targets (GitHub Actions, GitLab CI).
 *
 * AST-level types (TCICD*) live in core's ast/types.ts. These are the
 * intermediate representations produced during export.
 */

import type {
  TCICDMatrix,
  TCICDService,
  TCICDCache,
  TCICDArtifact,
} from '@synergenius/flow-weaver/ast';

export interface CICDStep {
  /** Node instance ID */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Node type (used for action mapping) */
  nodeType: string;
  /** Environment variables for this step */
  env?: Record<string, string>;
  /** Per-target deploy config from @deploy annotations on the node type */
  nodeTypeDeploy?: Record<string, Record<string, unknown>>;
}

export interface CICDJob {
  /** Job identifier (from [job: "name"]) */
  id: string;
  /** Human-readable job name */
  name: string;
  /** Runner label (from @runner or job-level override) */
  runner?: string;
  /** Jobs that must complete before this one */
  needs: string[];
  /** Steps in execution order */
  steps: CICDStep[];
  /** Deployment environment (from [environment: "name"]) */
  environment?: string;
  /** Secret names used by this job */
  secrets: string[];
  /** Matrix strategy */
  matrix?: TCICDMatrix;
  /** Sidecar services */
  services?: TCICDService[];
  /** Cache configuration */
  cache?: TCICDCache;
  /** Artifacts to upload after this job */
  uploadArtifacts?: TCICDArtifact[];
  /** Artifact names to download before this job */
  downloadArtifacts?: string[];
  /** Maximum retry count on failure (from @job) */
  retry?: number;
  /** Whether this job can fail without failing the pipeline (from @job) */
  allowFailure?: boolean;
  /** Job-level timeout duration (from @job) */
  timeout?: string;
  /** Environment variables (from @job or @variables) */
  variables?: Record<string, string>;
  /** Runner selection tags (from @job or @tags) */
  tags?: string[];
  /** Setup commands before main script (from @job or @before_script) */
  beforeScript?: string[];
  /** Conditional execution rules (from @job) */
  rules?: Array<{ if?: string; when?: string; allowFailure?: boolean; variables?: Record<string, string>; changes?: string[] }>;
  /** Coverage regex pattern (from @job) */
  coverage?: string;
  /** Test/coverage report declarations (from @job) */
  reports?: Array<{ type: string; path: string }>;
  /** GitLab template to extend (from @job) */
  extends?: string;
  /** Explicit stage name (from @stage) */
  stage?: string;
}

export interface ActionMapping {
  /** GitHub Actions `uses:` value */
  githubAction?: string;
  /** GitHub Actions `with:` defaults */
  githubWith?: Record<string, string>;
  /** GitLab CI script commands */
  gitlabScript?: string[];
  /** GitLab CI image override */
  gitlabImage?: string;
  /** Human-readable step name */
  label?: string;
}
