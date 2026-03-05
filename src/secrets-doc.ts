/**
 * SECRETS_SETUP.md generator for CI/CD workflows.
 */

import type { TCICDSecret } from '@synergenius/flow-weaver/ast';

/**
 * Generate a SECRETS_SETUP.md document with platform-specific instructions.
 */
export function generateSecretsDoc(secrets: TCICDSecret[], platform: string): string {
  if (secrets.length === 0) return '';

  const lines: string[] = [
    '# Secrets Setup Guide',
    '',
    `This workflow requires ${secrets.length} secret(s) to be configured.`,
    '',
  ];

  for (const secret of secrets) {
    lines.push(`## ${secret.name}`);
    if (secret.description) {
      lines.push(`> ${secret.description}`);
    }
    lines.push('');

    if (platform === 'github-actions' || secret.platform === 'all' || secret.platform === 'github' || !secret.platform) {
      lines.push('**GitHub Actions:**');
      lines.push('1. Go to your repository on GitHub');
      lines.push('2. Navigate to Settings > Secrets and variables > Actions');
      lines.push('3. Click "New repository secret"');
      lines.push(`4. Name: \`${secret.name}\``);
      lines.push('5. Paste your secret value and click "Add secret"');
      lines.push('');
    }

    if (platform === 'gitlab-ci' || secret.platform === 'all' || secret.platform === 'gitlab' || !secret.platform) {
      lines.push('**GitLab CI:**');
      lines.push('1. Go to your project on GitLab');
      lines.push('2. Navigate to Settings > CI/CD > Variables');
      lines.push('3. Click "Add variable"');
      lines.push(`4. Key: \`${secret.name}\``);
      lines.push('5. Paste your secret value');
      lines.push('6. Check "Mask variable" and optionally "Protect variable"');
      lines.push('7. Click "Add variable"');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
