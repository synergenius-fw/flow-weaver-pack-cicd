/**
 * @synergenius/flow-weaver-pack-cicd
 *
 * CI/CD pipeline infrastructure for Flow Weaver: tag handler, detection,
 * validation rules, job graph builder, and runtime types.
 *
 * Also includes expression node types for local testing, which map to
 * platform-native actions when exported to GitHub Actions or GitLab CI.
 */

// Infrastructure (used by export target packs)
export { cicdTagHandler } from './tag-handler.js';
export { isCICDWorkflow, getJobNames, getDeclaredSecrets, getReferencedSecrets } from './detection.js';
export { getCICDValidationRules } from './rules.js';
export { buildJobGraph } from './job-graph.js';
export { resolveJobSecrets } from './secrets.js';
export { injectArtifactSteps } from './artifacts.js';
export { generateSecretsDoc } from './secrets-doc.js';
export { NATIVE_CI_STEPS } from './native-steps.js';
export type { CICDJob, CICDStep, ActionMapping } from './types.js';

// Node types (for workflow authoring)
export * from './node-types/index.js';
