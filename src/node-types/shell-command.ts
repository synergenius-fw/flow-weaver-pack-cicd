import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Shell Command
 * @color gray
 * @icon terminal
 * @input command [order:0] - Shell command to execute
 * @input workingDirectory [order:1] - Working directory (default: repo root)
 * @output stdout [order:0] - Standard output
 * @output exitCode [order:1] - Exit code
 */
export function shellCommand(
  command: string = 'echo "hello"',
  workingDirectory: string = '.',
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd: workingDirectory,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trimEnd(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const output = (e.stdout || '') + (e.stderr || '');
    return { stdout: output.trimEnd(), exitCode: e.status ?? 1 };
  }
}
