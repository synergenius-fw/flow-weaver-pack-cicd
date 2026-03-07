import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Docker Push
 * @color blue
 * @icon cloud_upload
 * @input imageId [order:0] - Image ID to push
 * @input tags [order:1] - Tags to push (comma-separated)
 * @output digest [order:0] - Pushed image digest
 */
export function dockerPush(
  imageId: string = '',
  tags: string = 'latest',
): { digest: string } {
  const tagList = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  let digest = '';
  for (const tag of tagList) {
    const ref = imageId.includes(':') ? imageId : `${imageId}:${tag}`;
    const output = execSync(`docker push ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = output.match(/digest:\s*(sha256:[a-f0-9]+)/i);
    if (match) digest = match[1];
  }

  return { digest: digest || imageId };
}
