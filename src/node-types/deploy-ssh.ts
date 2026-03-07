import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Deploy SSH
 * @color purple
 * @icon cloud_upload
 * @input host [order:0] - SSH host
 * @input sshKey [order:1] - SSH private key
 * @input sourcePath [order:2] - Local path to deploy
 * @input remotePath [order:3] - Remote deployment path
 * @output result [order:0] - Deployment result message
 */
export function deploySsh(
  host: string = '',
  sshKey: string = '',
  sourcePath: string = 'dist/',
  remotePath: string = '/app/',
): { result: string } {
  const keyFile = path.join(os.tmpdir(), `.fw-deploy-key-${process.pid}`);
  try {
    fs.writeFileSync(keyFile, sshKey, { mode: 0o600 });
    execSync(
      `rsync -avz -e "ssh -i ${keyFile} -o StrictHostKeyChecking=no" ${sourcePath} ${host}:${remotePath}`,
      { encoding: 'utf-8', stdio: 'inherit' },
    );
    return { result: `Deployed ${sourcePath} to ${host}:${remotePath}` };
  } finally {
    try { fs.unlinkSync(keyFile); } catch { /* best effort cleanup */ }
  }
}
