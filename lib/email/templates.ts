import type { Email } from "./send";

/**
 * The leader emails, in the same design as the sign-in code email
 * (supabase/templates/sign-in-code.html): table layout and inline styles
 * so Gmail and Outlook render them, plus a plain-text version of each.
 */

const FONT = "'Urbanist',Arial,Helvetica,sans-serif";
const DISPLAY = "'Sora',Arial,Helvetica,sans-serif";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes, keeping the organiser's line breaks. */
function paragraphs(value: string): string {
  return esc(value).replace(/\r?\n/g, "<br />");
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" style="background-color:#2C1D44; border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block; padding:14px 28px; font-family:${FONT}; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none;">${esc(label)}</a>
    </td></tr></table>`;
}

function layout(opts: { site: string; preview: string; eyebrow: string; heading: string; body: string }): string {
  const { site } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${esc(opts.heading)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Urbanist:wght@400;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0; padding:0; background-color:#F4F6FA; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F4F6FA;">${esc(opts.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px; background-color:#FFFFFF; border-radius:20px; overflow:hidden; border:1px solid #E6E3EE;">
        <tr><td height="6" style="height:6px; line-height:6px; font-size:0; background-color:#C756D9; background-image:linear-gradient(90deg,#F47920 0%,#C756D9 50%,#3182FC 100%);">&nbsp;</td></tr>
        <tr><td align="center" style="padding:32px 32px 8px;">
          <img src="${site}/gignite-logo.png" width="200" alt="gIGNITE 2026" style="display:block; width:200px; max-width:100%; height:auto; border:0;" />
        </td></tr>
        <tr><td align="center" style="padding:16px 32px 0; font-family:${FONT}; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#2C1D44;">
          <span style="color:#F47920;">&#9632;</span>&nbsp; ${esc(opts.eyebrow)}
        </td></tr>
        <tr><td align="center" style="padding:10px 32px 0; font-family:${DISPLAY}; font-size:26px; line-height:32px; font-weight:700; color:#2C1D44;">
          ${esc(opts.heading)}
        </td></tr>
        ${opts.body}
        <tr><td style="padding:28px 32px 0;"><div style="height:1px; line-height:1px; font-size:0; background-color:#ECEAF2;">&nbsp;</div></td></tr>
        <tr><td align="center" style="padding:22px 24px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" valign="middle" style="padding:0 12px;"><img src="${site}/gadgeon-logo.png" width="108" alt="Gadgeon Smart Systems" style="display:block; width:108px; height:auto; border:0;" /></td>
            <td align="center" valign="middle" style="padding:0 12px;"><img src="${site}/fisat-sb-logo.png" width="68" alt="IEEE FISAT Student Branch" style="display:block; width:68px; height:auto; border:0;" /></td>
            <td align="center" valign="middle" style="padding:0 12px;"><img src="${site}/ieee_sps_kc_logo.png" width="108" alt="IEEE Signal Processing Society Kerala Chapter" style="display:block; width:108px; height:auto; border:0;" /></td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:10px 32px 32px; font-family:${FONT}; font-size:12px; line-height:18px; color:#99A1AF;">
          gIGNITE 2026 &middot; Organised by Gadgeon Smart Systems &middot; Execution partner IEEE<br />
          Questions? Just reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function text(...lines: string[]): string {
  return [...lines, "", "—", "gIGNITE 2026 · Organised by Gadgeon Smart Systems · Execution partner IEEE", "Questions? Just reply to this email."].join("\n");
}

const intro = (html: string) =>
  `<tr><td align="center" style="padding:12px 40px 0; font-family:${FONT}; font-size:16px; line-height:24px; color:#4C3D66;">${html}</td></tr>`;
const block = (html: string) => `<tr><td style="padding:24px 32px 0;">${html}</td></tr>`;
const center = (html: string) => `<tr><td align="center" style="padding:24px 32px 0;">${html}</td></tr>`;
const note = (html: string) =>
  block(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#F4F6FA; border-radius:12px; padding:14px 16px; font-family:${FONT}; font-size:14px; line-height:21px; color:#4C3D66;">${html}</td></tr></table>`,
  );

// ---------------------------------------------------------------------------

export function registrationReceivedEmail(opts: {
  site: string;
  to: string;
  leaderName: string;
  teamName: string;
  entryCode: string;
  statusUrl: string;
  members: { name: string; code: string; isLeader: boolean }[];
}): Email {
  const memberRows = opts.members
    .map(
      (m) => `<tr>
        <td style="padding:8px 0; border-bottom:1px solid #ECEAF2; font-family:${FONT}; font-size:15px; color:#2C1D44;">${esc(m.name)}${m.isLeader ? ' <span style="color:#C756D9; font-weight:600;">· Leader</span>' : ""}</td>
        <td align="right" style="padding:8px 0; border-bottom:1px solid #ECEAF2; font-family:${FONT}; font-size:14px; font-weight:700; letter-spacing:1px; color:#2C1D44;">${esc(m.code)}</td>
      </tr>`,
    )
    .join("");
  const html = layout({
    site: opts.site,
    preview: `${opts.teamName} is registered for gIGNITE 2026. Your team's ID cards are attached.`,
    eyebrow: "Registration received",
    heading: "You're in! 🎉",
    body:
      intro(
        `Hi ${esc(opts.leaderName)}, your squad <strong style="color:#2C1D44;">${esc(opts.teamName)}</strong> is registered for gIGNITE 2026. We'll email you again when the results are out.`,
      ) +
      center(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color:#F2F0F8; border:1px solid #E1DCEF; border-radius:16px; padding:14px 24px; font-family:${FONT}; font-size:13px; color:#6A7282;">Team entry code<br /><span style="font-family:${DISPLAY}; font-size:24px; line-height:32px; font-weight:700; letter-spacing:3px; color:#2C1D44;">${esc(opts.entryCode)}</span></td></tr></table>`,
      ) +
      block(
        `<div style="font-family:${FONT}; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#2C1D44; padding-bottom:4px;">Your squad</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${memberRows}</table>`,
      ) +
      note(
        `<strong style="color:#2C1D44;">ID cards attached.</strong> There's one for each member, with a QR code that's scanned at check-in. Please share each card with its member and keep them handy on event day.`,
      ) +
      center(button(opts.statusUrl, "View registration status")),
  });
  return {
    to: opts.to,
    subject: `You're registered for gIGNITE 2026 — ${opts.teamName}`,
    html,
    text: text(
      `Hi ${opts.leaderName},`,
      "",
      `Your squad "${opts.teamName}" is registered for gIGNITE 2026. We'll email you again when the results are out.`,
      "",
      `Team entry code: ${opts.entryCode}`,
      "",
      "Your squad:",
      ...opts.members.map((m) => `- ${m.name}${m.isLeader ? " (Leader)" : ""} — ${m.code}`),
      "",
      "ID cards are attached — one per member, with a QR code that's scanned at check-in. Please share each card with its member.",
      "",
      `Registration status: ${opts.statusUrl}`,
    ),
  };
}

export function ineligibleEmail(opts: { site: string; to: string; leaderName: string; teamName: string; statusUrl: string }): Email {
  const html = layout({
    site: opts.site,
    preview: `An update on ${opts.teamName}'s gIGNITE 2026 registration.`,
    eyebrow: "Registration update",
    heading: "We couldn't confirm your eligibility",
    body:
      intro(
        `Hi ${esc(opts.leaderName)}, while checking the details and ID cards for <strong style="color:#2C1D44;">${esc(opts.teamName)}</strong>, we couldn't confirm that your team meets the gIGNITE 2026 eligibility requirements.`,
      ) +
      note(
        `If you think this is a mistake, or you'd like to know more, <strong style="color:#2C1D44;">reply to this email</strong> and the organising team will get back to you.`,
      ) +
      center(button(opts.statusUrl, "View registration status")),
  });
  return {
    to: opts.to,
    subject: `Update on your gIGNITE 2026 registration — ${opts.teamName}`,
    html,
    text: text(
      `Hi ${opts.leaderName},`,
      "",
      `While checking the details and ID cards for "${opts.teamName}", we couldn't confirm that your team meets the gIGNITE 2026 eligibility requirements.`,
      "",
      "If you think this is a mistake, or you'd like to know more, reply to this email and the organising team will get back to you.",
      "",
      `Registration status: ${opts.statusUrl}`,
    ),
  };
}

export function resultEmail(opts: {
  site: string;
  to: string;
  leaderName: string;
  teamName: string;
  statusUrl: string;
  outcome: "shortlisted" | "not_selected";
  /** The organiser's message for this outcome, from the Results panel. */
  message: string | null;
}): Email {
  const shortlisted = opts.outcome === "shortlisted";
  const heading = shortlisted ? "You're shortlisted! 🎉" : "Thank you for taking part";
  const lead = shortlisted
    ? `Congratulations, ${esc(opts.leaderName)}! <strong style="color:#2C1D44;">${esc(opts.teamName)}</strong> has been shortlisted for gIGNITE 2026.`
    : `Hi ${esc(opts.leaderName)}, thank you for registering <strong style="color:#2C1D44;">${esc(opts.teamName)}</strong> for gIGNITE 2026. We received many strong ideas, and unfortunately your team wasn't selected this time.`;
  const leadText = shortlisted
    ? `Congratulations, ${opts.leaderName}! "${opts.teamName}" has been shortlisted for gIGNITE 2026.`
    : `Hi ${opts.leaderName}, thank you for registering "${opts.teamName}" for gIGNITE 2026. We received many strong ideas, and unfortunately your team wasn't selected this time.`;
  const html = layout({
    site: opts.site,
    preview: shortlisted ? `${opts.teamName} is shortlisted for gIGNITE 2026!` : `gIGNITE 2026 results for ${opts.teamName}.`,
    eyebrow: "Results",
    heading,
    body:
      intro(lead) +
      (opts.message ? note(paragraphs(opts.message)) : "") +
      center(button(opts.statusUrl, "View your result")),
  });
  return {
    to: opts.to,
    subject: shortlisted ? `🎉 ${opts.teamName} is shortlisted for gIGNITE 2026` : `gIGNITE 2026 results — ${opts.teamName}`,
    html,
    text: text(leadText, ...(opts.message ? ["", opts.message] : []), "", `View your result: ${opts.statusUrl}`),
  };
}
