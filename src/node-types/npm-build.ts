import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label npm Build
 * @color orange
 * @icon build
 * @output output [order:0] - Build output directory path
 */
export function npmBuild(): { output: string } {
  execSync('npm run build', { encoding: 'utf-8', stdio: 'inherit' });
  return { output: 'dist' };
}
