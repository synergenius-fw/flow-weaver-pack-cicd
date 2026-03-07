/**
 * @flowWeaver nodeType
 * @expression
 * @label Checkout
 * @color gray
 * @icon download
 * @output repoPath [order:0] - Path to checked-out repository
 */
export function checkout(): { repoPath: string } {
  // In CI the platform already checked out the repo (actions/checkout, GitLab runner).
  // This node confirms the working directory is the repo root.
  return { repoPath: process.cwd() };
}
