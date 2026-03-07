/**
 * @flowWeaver nodeType
 * @expression
 * @label Slack Notify
 * @color yellow
 * @icon chat
 * @input webhookUrl [order:0] - Slack webhook URL
 * @input message [order:1] - Message text
 * @input channel [order:2] - Channel override (optional)
 * @output sent [order:0] - Whether notification was sent
 */
export async function slackNotify(
  webhookUrl: string = '',
  message: string = 'Pipeline complete',
  channel?: string,
): Promise<{ sent: boolean }> {
  const payload: Record<string, string> = { text: message };
  if (channel) payload.channel = channel;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }
  return { sent: true };
}
