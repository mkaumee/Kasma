import { env } from "@/lib/env";

/**
 * Minimal email sender over the Resend HTTP API (no SDK dependency). Degrades
 * gracefully: without RESEND_API_KEY it logs and no-ops, so the app runs fully
 * in environments where email isn't configured.
 */

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendResult = { sent: boolean; reason?: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    console.log(
      `[email] skipped (RESEND_API_KEY unset): "${msg.subject}" → ${
        Array.isArray(msg.to) ? msg.to.join(", ") : msg.to
      }`,
    );
    return { sent: false, reason: "not-configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed: HTTP ${res.status}`);
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] send error", error);
    return { sent: false, reason: "error" };
  }
}
