/**
 * @flowWeaver nodeType
 * @expression
 * @label Setup Node.js
 * @color green
 * @icon terminal
 * @input version [order:0] - Node.js version (e.g., "20", "18")
 * @output nodeVersion [order:0] - Installed Node.js version
 */
export function setupNode(version: string = '20'): { nodeVersion: string } {
  // In CI the platform provisions Node.js (actions/setup-node, GitLab image).
  // Validate that the running version matches what the workflow expects.
  const actual = process.versions.node;
  const majorActual = actual.split('.')[0];
  const majorExpected = version.split('.')[0];

  if (majorActual !== majorExpected) {
    console.warn(
      `[setupNode] Expected Node.js ${version} but running ${actual}. ` +
      `Ensure your CI runner/image provides the correct version.`,
    );
  }
  return { nodeVersion: actual };
}
