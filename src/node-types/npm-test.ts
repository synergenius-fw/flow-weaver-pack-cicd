import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label npm Test
 * @color teal
 * @icon check_circle
 * @output exitCode [order:0] - Test exit code (0 = pass)
 * @output testOutput [order:1] - Test output text
 */
export function npmTest(): { exitCode: number; testOutput: string } {
  try {
    const output = execSync('npm test', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, testOutput: output.trimEnd() };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const output = (e.stdout || '') + (e.stderr || '');
    return { exitCode: e.status ?? 1, testOutput: output.trimEnd() };
  }
}
