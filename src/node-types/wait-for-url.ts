/**
 * @flowWeaver nodeType
 * @expression
 * @label Wait for URL
 * @color teal
 * @icon schedule
 * @input url [order:0] - URL to wait for
 * @input timeoutSeconds [order:1] - Maximum wait time in seconds (default: 300)
 * @input intervalSeconds [order:2] - Check interval in seconds (default: 10)
 * @output available [order:0] - Whether the URL became available
 * @output waitedSeconds [order:1] - How long we waited
 */
export async function waitForUrl(
  url: string = '',
  timeoutSeconds: number = 300,
  intervalSeconds: number = 10,
): Promise<{ available: boolean; waitedSeconds: number }> {
  const start = Date.now();
  const deadline = start + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return { available: true, waitedSeconds: Math.round((Date.now() - start) / 1000) };
      }
    } catch {
      // not available yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }

  return { available: false, waitedSeconds: timeoutSeconds };
}
