import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Setup Python
 * @color blue
 * @icon terminal
 * @input version [order:0] - Python version (e.g., "3.12", "3.11")
 * @output pythonVersion [order:0] - Installed Python version
 */
export function setupPython(version: string = '3.12'): { pythonVersion: string } {
  // In CI the platform provisions Python (actions/setup-python, GitLab image).
  // Validate the installed version matches expectations.
  let actual: string;
  try {
    const output = execSync('python3 --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    actual = output.replace(/^Python\s*/i, '').trim();
  } catch {
    console.warn('[setupPython] python3 not found on PATH');
    return { pythonVersion: 'not found' };
  }

  const expectedParts = version.split('.');
  const actualParts = actual.split('.');
  const mismatch = expectedParts.some((part, i) => actualParts[i] !== part);

  if (mismatch) {
    console.warn(
      `[setupPython] Expected Python ${version} but found ${actual}. ` +
      `Ensure your CI runner/image provides the correct version.`,
    );
  }
  return { pythonVersion: actual };
}
