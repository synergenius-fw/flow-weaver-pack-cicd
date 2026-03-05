/**
 * Native CI steps that every CI/CD job needs regardless of workflow content.
 * These are the setup steps (checkout, install) that run before the
 * compiled workflow code.
 */

import type { ActionMapping } from './types.js';

/**
 * Built-in action mappings for native CI steps.
 * These are only used by the platform-specific export targets (GitHub Actions, GitLab CI)
 * for the setup steps that precede `node dist/workflow.cicd.js --job=X`.
 */
export const NATIVE_CI_STEPS: Record<string, ActionMapping> = {
  checkout: {
    githubAction: 'actions/checkout@v4',
    gitlabScript: ['echo "Checkout handled by GitLab CI runner"'],
    label: 'Checkout code',
  },
  'setup-node': {
    githubAction: 'actions/setup-node@v4',
    githubWith: { 'node-version': '20' },
    gitlabImage: 'node:20',
    label: 'Setup Node.js',
  },
  'setup-python': {
    githubAction: 'actions/setup-python@v5',
    githubWith: { 'python-version': '3.12' },
    gitlabImage: 'python:3.12',
    label: 'Setup Python',
  },
};
