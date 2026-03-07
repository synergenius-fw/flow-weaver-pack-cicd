/**
 * @flowWeaver nodeType
 * @expression
 * @label Health Check
 * @color green
 * @icon favorite
 * @input url [order:0] - URL to check
 * @input retries [order:1] - Number of retries (default: 10)
 * @input delaySeconds [order:2] - Delay between retries in seconds (default: 5)
 * @output healthy [order:0] - Whether the URL is healthy
 * @output statusCode [order:1] - HTTP status code
 */
export async function healthCheck(
  url: string = '',
  retries: number = 10,
  delaySeconds: number = 5,
): Promise<{ healthy: boolean; statusCode: number }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return { healthy: true, statusCode: response.status };
      }
      if (attempt === retries) {
        return { healthy: false, statusCode: response.status };
      }
    } catch {
      if (attempt === retries) {
        return { healthy: false, statusCode: 0 };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }
  return { healthy: false, statusCode: 0 };
}
