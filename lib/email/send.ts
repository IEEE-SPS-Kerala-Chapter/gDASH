import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sends mail from gignite@gadgeon.com over Gmail SMTP (an app password,
 * not the account password). Set per Vercel project:
 *   GMAIL_USER, GMAIL_APP_PASSWORD — the sending account
 *   PUBLIC_SITE_URL                — the participant site, for links, logos and ID-card QR codes
 *                                    (needed on the staff site too: result and
 *                                    ineligible emails are sent from there)
 * Without GMAIL_* (local dev) emails are logged instead of sent.
 */

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };
export type Email = { to: string; subject: string; html: string; text: string; attachments?: EmailAttachment[] };

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  transporter ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    // A results batch reuses one connection instead of logging in per email.
    pool: true,
    maxConnections: 2,
  });
  return transporter;
}

/** Throws when Gmail refuses the message, so the caller can record the failure. */
export async function sendEmail(email: Email): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.info(
      `[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — not sending "${email.subject}" to ${email.to}` +
        (email.attachments?.length ? ` (${email.attachments.length} attachments)` : ""),
    );
    return;
  }
  const from = process.env.GMAIL_USER!.trim();
  await t.sendMail({
    from: { name: "gIGNITE 2026", address: from },
    replyTo: from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: email.attachments,
  });
}

/** The participant site's origin, without a trailing slash. */
export function publicSiteUrl(): string {
  const url = process.env.PUBLIC_SITE_URL?.trim() || "https://gignite-register.ieeespskc.in";
  return url.replace(/\/+$/, "");
}
