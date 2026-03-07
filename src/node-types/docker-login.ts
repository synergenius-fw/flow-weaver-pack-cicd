import { execSync } from 'node:child_process';

/**
 * @flowWeaver nodeType
 * @expression
 * @label Docker Login
 * @color blue
 * @icon lock
 * @input registry [order:0] - Registry URL (e.g., ghcr.io, docker.io)
 * @input username [order:1] - Registry username
 * @input password [order:2] - Registry password or token
 * @input token [order:3] - Auth token (alternative to username/password)
 * @output loggedIn [order:0] - Whether login succeeded
 */
export function dockerLogin(
  registry: string = 'docker.io',
  username?: string,
  password?: string,
  token?: string,
): { loggedIn: boolean } {
  const credential = password || token || '';
  const user = username || (token ? 'oauth2accesstoken' : '');

  if (!user || !credential) {
    throw new Error('dockerLogin requires username+password or token');
  }

  execSync(`docker login -u ${user} --password-stdin ${registry}`, {
    input: credential,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { loggedIn: true };
}
