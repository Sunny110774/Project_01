export async function sendAlertEmail(recipients: string[], subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM || process.env.MFA_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Outbound email is not configured on the server.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, text }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
}