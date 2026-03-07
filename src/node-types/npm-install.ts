import { execSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * @flowWeaver nodeType
 * @expression
 * @label npm Install
 * @color green
 * @icon package
 * @input npmToken [order:0] - NPM auth token (optional, for private packages)
 * @output nodeModulesPath [order:0] - Path to node_modules
 */
export function npmInstall(npmToken?: string): { nodeModulesPath: string } {
  const env = { ...process.env };
  if (npmToken) {
    env.NPM_TOKEN = npmToken;
  }
  execSync('npm ci', { encoding: 'utf-8', stdio: 'inherit', env });
  return { nodeModulesPath: path.resolve('node_modules') };
}
