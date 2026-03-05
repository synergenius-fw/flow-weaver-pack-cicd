/**
 * CI/CD pack self-registration module.
 *
 * Registers tag handlers and validation rules through the core
 * registry APIs. This module can be imported as a side-effect,
 * or the pack can be discovered via manifest-based discovery.
 */

import {
  tagHandlerRegistry,
  validationRuleRegistry,
} from '@synergenius/flow-weaver/api';
import { cicdTagHandler } from './tag-handler.js';
import { isCICDWorkflow } from './detection.js';
import { getCICDValidationRules } from './rules.js';

// ── Tag handlers ────────────────────────────────────────────────────────────

tagHandlerRegistry.register(
  [
    'secret', 'runner', 'cache', 'artifact', 'environment', 'matrix',
    'service', 'concurrency', 'job', 'stage', 'variables',
    'before_script', 'tags', 'includes', '_cicdTrigger',
  ],
  'cicd',
  'workflow',
  cicdTagHandler,
);

// ── Validation rules ────────────────────────────────────────────────────────

validationRuleRegistry.register({
  name: 'CI/CD Rules',
  namespace: 'cicd',
  detect: isCICDWorkflow,
  getRules: getCICDValidationRules,
});
