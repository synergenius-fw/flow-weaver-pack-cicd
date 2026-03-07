import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Docker Build
 * @color blue
 * @icon layers
 * @input context [order:0] - Build context path (default: ".")
 * @input dockerfile [order:1] - Dockerfile path (default: "Dockerfile")
 * @input tags [order:2] - Image tags (comma-separated)
 * @output imageId [order:0] - Built image ID
 */
export function dockerBuild(
  context: string = '.',
  dockerfile: string = 'Dockerfile',
  tags: string = 'latest',
): { imageId: string } {
  const tagArgs = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `-t ${t}`)
    .join(' ');

  const output = execSync(
    `docker build -f ${dockerfile} ${tagArgs} --quiet ${context}`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  return { imageId: output.trim() };
}
