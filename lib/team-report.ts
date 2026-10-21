import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderIdCardPng } from "@/lib/email/id-card-image";
import { publicSiteUrl } from "@/lib/email/send";
import { deckFileName } from "@/lib/deck-file-name";
import { ambassadorLabel } from "@/lib/ambassador";
import { REGISTRATION_STATUS_LABELS, VERIFICATION_STATUS_LABELS } from "@/lib/registration-status";
import { reportFileBase } from "@/lib/report-file-name";

/**
 * A team's "report card" PDF for organisers: team and member details, the
 * idea answers, every member's generated ID card, and the college ID cards
 * they uploaded. The pitch deck isn't inside it: the zip downloads put every
 * deck, PDF or PowerPoint, in a separate "Pitch decks" folder under the same
 * "TeamName-GIG-XXXXXX" name, and the report says which file it is.
 *
 * Built with the service-role client — callers must have checked the
 * caller is an admin. Kept in the private team-reports bucket under the
 * registration's version (which changes on every edit), so an unchanged
 * team is served from there instead of being rebuilt.
 */

// Bump when the layout changes, so stored reports are rebuilt.
const REPORT_FORMAT = 4;
const REPORTS_BUCKET = "team-reports";

export type TeamReport = {
  /** Path in the team-reports bucket. */
  pdfPath: string;
  /** "TeamName-GIG-XXXXXX" — the PDF is this plus ".pdf". */
  fileBase: string;
  /** The uploaded deck and the name it goes by in the zip ("TeamName-GIG-XXXXXX.pdf" / ".pptx"). */
  deck: { path: string; fileName: string } | null;
};

/** The deck's name next to the reports: the report's base name plus the deck's own extension. */
export function deckDownloadName(fileBase: string, deckPath: string): string {
  const ext = deckPath.toLowerCase().endsWith(".pptx") ? "pptx" : "pdf";
  return `${fileBase}.${ext}`;
}

type ReportMember = {
  id: string;
  member_no: number;
  member_code: string;
  full_name: string;
  email: string;
  phone: string;
  college: string;
  branch: string | null;
  year: string | null;
  role_in_team: string | null;
  is_leader: boolean;
  id_card_path: string | null;
};

type ReportTeam = {
  id: string;
  name: string;
  entry_code: string;
  ai_theme: string;
  district: string;
  created_at: string;
  team_members: ReportMember[];
  registrations: ReportRegistration | ReportRegistration[] | null;
};

type ReportRegistration = {
  version: number;
  status: string;
  verification_status: string;
  problem_statement: string;
  proposed_solution: string;
  ai_approach: string;
  expected_impact: string;
  supporting_link: string | null;
  deck_path: string | null;
  ambassador_number: number | null;
  created_at: string;
};


async function loadTeam(teamId: string): Promise<ReportTeam | null> {
  const { data, error } = await createAdminClient()
    .from("teams")
    .select(
      `id, name, entry_code, ai_theme, district, created_at,
       team_members ( id, member_no, member_code, full_name, email, phone, college, branch, year, role_in_team, is_leader, id_card_path ),
       registrations ( version, status, verification_status, problem_statement, proposed_solution, ai_approach, expected_impact, supporting_link, deck_path, ambassador_number, created_at )`,
    )
    .eq("id", teamId)
    .maybeSingle();
  if (error) throw new Error(`could not load team: ${error.message}`);
  return data as ReportTeam | null;
}

/** The team's report, built (and stored) if there isn't one for its current version. */
export async function getTeamReport(teamId: string): Promise<TeamReport | null> {
  const team = await loadTeam(teamId);
  const reg = team && (Array.isArray(team.registrations) ? team.registrations[0] : team.registrations);
  if (!team || !reg) return null;

  const fileBase = reportFileBase(team.name, team.entry_code);
  const deck = reg.deck_path ? { path: reg.deck_path, fileName: deckDownloadName(fileBase, reg.deck_path) } : null;

  const admin = createAdminClient();
  const fileName = `r${REPORT_FORMAT}-v${reg.version}.pdf`;
  const pdfPath = `${team.id}/${fileName}`;
  const { data: existing } = await admin.storage.from(REPORTS_BUCKET).list(team.id, { limit: 100 });
  if (existing?.some((f) => f.name === fileName)) {
    return { pdfPath, fileBase, deck };
  }

  const pdf = await buildReportPdf(team, reg);
  const { error } = await admin.storage
    .from(REPORTS_BUCKET)
    .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`could not store the report: ${error.message}`);

  // Older versions of this team's report are no longer needed.
  const stale = (existing ?? []).map((f) => `${team.id}/${f.name}`).filter((p) => p !== pdfPath);
  if (stale.length > 0) await admin.storage.from(REPORTS_BUCKET).remove(stale);

  return { pdfPath, fileBase, deck };
}

/** Builds a team's report without storing it (for checking the layout). */
export async function renderTeamReport(teamId: string): Promise<Uint8Array | null> {
  const team = await loadTeam(teamId);
  const reg = team && (Array.isArray(team.registrations) ? team.registrations[0] : team.registrations);
  return team && reg ? buildReportPdf(team, reg) : null;
}

/** A short-lived link to a stored report (or deck) that downloads as `downloadName`. */
export async function signedDownloadUrl(bucket: string, filePath: string, downloadName: string): Promise<string | null> {
  // 5 minutes, like the deck and ID-card links: the browser uses it straight away.
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrl(filePath, 60 * 5, { download: downloadName });
  return data?.signedUrl ?? null;
}

export const TEAM_REPORTS_BUCKET = REPORTS_BUCKET;

// ---------------------------------------------------------------------------
// PDF layout (A4, points).

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
// The logo bar and brand strip at the top of every page.
const HEADER_H = 74;
// Image grids (ID cards): one row is the box, its caption and the gap below.
const IMAGE_BOX_H = 190;
const IMAGE_CAPTION_H = 26;
const IMAGE_ROW_H = IMAGE_BOX_H + IMAGE_CAPTION_H + 8;

const INK = rgb(0x2c / 255, 0x1d / 255, 0x44 / 255);
const MUTED = rgb(0x6a / 255, 0x72 / 255, 0x82 / 255);
const MAGENTA = rgb(0xc7 / 255, 0x56 / 255, 0xd9 / 255);
const RULE = rgb(0xe1 / 255, 0xdc / 255, 0xef / 255);

type Fonts = { regular: PDFFont; semi: PDFFont; bold: PDFFont; display: PDFFont };
/** The site header's partner logos (components/registration/ui.tsx LogoHeaderBar) and the gIGNITE wordmark. */
type Logos = { gadgeon: PDFImage; fisat: PDFImage; ieee: PDFImage; gignite: PDFImage };

type AssetBytes = { fonts: Record<keyof Fonts, Buffer>; logos: Record<keyof Logos, Buffer> };

let assetBytes: Promise<AssetBytes> | null = null;

function loadAssetBytes() {
  assetBytes ??= (async () => {
    const root = process.cwd();
    const font = (file: string) => readFile(path.join(root, "lib/email/fonts", file));
    const image = (file: string) => readFile(path.join(root, "public", file));
    const [regular, semi, bold, display, gadgeon, fisat, ieee, gignite] = await Promise.all([
      font("Urbanist-Regular.ttf"),
      font("Urbanist-SemiBold.ttf"),
      font("Urbanist-Bold.ttf"),
      font("Sora-SemiBold.ttf"),
      image("gadgeon-logo.png"),
      image("fisat-sb-logo.png"),
      image("ieee_sps_kc_logo.png"),
      image("gignite-logo.png"),
    ]);
    return { fonts: { regular, semi, bold, display }, logos: { gadgeon, fisat, ieee, gignite } };
  })();
  assetBytes.catch(() => {
    assetBytes = null;
  });
  return assetBytes;
}

// The brand gradient (bg-brand-gradient in app/globals.css): orange → magenta → blue.
const BRAND_STOPS = [
  [0xf4, 0x79, 0x20],
  [0xc7, 0x56, 0xd9],
  [0x31, 0x82, 0xfc],
] as const;

function brandColorAt(t: number) {
  const scaled = Math.min(Math.max(t, 0), 1) * (BRAND_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), BRAND_STOPS.length - 2);
  const f = scaled - i;
  const [a, b] = [BRAND_STOPS[i], BRAND_STOPS[i + 1]];
  return rgb(...([0, 1, 2].map((k) => (a[k] + (b[k] - a[k]) * f) / 255) as [number, number, number]));
}

/** A horizontal brand-gradient strip, drawn as thin slices. */
function drawBrandStrip(page: PDFPage, x: number, y: number, width: number, height: number) {
  const slices = 80;
  const w = width / slices;
  for (let i = 0; i < slices; i++) {
    // A hair of overlap so no seams show between slices.
    page.drawRectangle({ x: x + i * w, y, width: w + 0.4, height, color: brandColorAt(i / (slices - 1)) });
  }
}

/** Draws `image` fitted into a box `height` tall, at x (left), centred or right-aligned on it. */
function drawLogo(page: PDFPage, image: PDFImage, x: number, top: number, height: number, align: "left" | "center" | "right") {
  const width = (image.width / image.height) * height;
  const left = align === "left" ? x : align === "center" ? x - width / 2 : x - width;
  page.drawImage(image, { x: left, y: top - height, width, height });
}

/** Plain text the fonts can lay out: no tabs or control characters, normalised line breaks. */
function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    const words = paragraph.split(/ +/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the column: break it by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Writes top to bottom, starting a new page when the current one is full. */
class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts,
    private logos: Logos,
    private footer: string,
  ) {
    this.newPage();
  }

  /** A page with the site's header — partner logos over the brand strip — and the footer line. */
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    const logoTop = PAGE_H - 20;
    drawLogo(this.page, this.logos.gadgeon, MARGIN, logoTop, 30, "left");
    drawLogo(this.page, this.logos.fisat, PAGE_W / 2, logoTop, 30, "center");
    drawLogo(this.page, this.logos.ieee, PAGE_W - MARGIN, logoTop, 28, "right");
    drawBrandStrip(this.page, 0, PAGE_H - HEADER_H + 14, PAGE_W, 3.5);
    this.y = PAGE_H - HEADER_H - 14;

    drawBrandStrip(this.page, MARGIN, 38, CONTENT_W, 1.2);
    this.page.drawText(this.footer, { x: MARGIN, y: 24, size: 8, font: this.fonts.regular, color: MUTED });
  }

  /** The gIGNITE wordmark, `height` tall, at the cursor. */
  wordmark(height: number) {
    this.ensure(height + 8);
    drawLogo(this.page, this.logos.gignite, MARGIN, this.y, height, "left");
    this.y -= height + 8;
  }

  /** Room for `height` more points, or a new page. */
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  text(value: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? 10.5;
    const lineHeight = size * 1.4;
    const indent = opts.indent ?? 0;
    for (const line of wrap(value, font, size, CONTENT_W - indent)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y + size * 0.3, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 0;
  }

  /**
   * A section title. `keepWith` is the height of what must follow it on the
   * same page (e.g. the first row of images), so a title is never left at
   * the bottom of a page with its content on the next.
   */
  heading(value: string, keepWith = 0) {
    this.ensure(48 + keepWith);
    this.y -= 14;
    this.text(value.toUpperCase(), { font: this.fonts.bold, size: 9.5, color: MAGENTA, gap: 4 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 8;
  }

  /** "Label   value" rows. */
  field(label: string, value: string) {
    const size = 10.5;
    const labelW = 120;
    const lines = wrap(value || "—", this.fonts.regular, size, CONTENT_W - labelW);
    lines.forEach((line, i) => {
      this.ensure(size * 1.45);
      this.y -= size * 1.45;
      if (i === 0) this.page.drawText(label, { x: MARGIN, y: this.y + size * 0.3, size, font: this.fonts.semi, color: MUTED });
      this.page.drawText(line, { x: MARGIN + labelW, y: this.y + size * 0.3, size, font: this.fonts.regular, color: INK });
    });
  }

  /** Images two to a row, each fitted into a box with a caption underneath. */
  imageGrid(items: { image: PDFImage | null; caption: string; missing?: string }[]) {
    const gap = 16;
    const boxW = (CONTENT_W - gap) / 2;
    const boxH = IMAGE_BOX_H;
    const captionH = IMAGE_CAPTION_H;
    for (let i = 0; i < items.length; i += 2) {
      this.ensure(boxH + captionH + 8);
      const top = this.y;
      items.slice(i, i + 2).forEach((item, col) => {
        const x = MARGIN + col * (boxW + gap);
        if (item.image) {
          const scale = Math.min(boxW / item.image.width, boxH / item.image.height);
          const w = item.image.width * scale;
          const h = item.image.height * scale;
          this.page.drawImage(item.image, { x: x + (boxW - w) / 2, y: top - h, width: w, height: h });
        } else {
          this.page.drawRectangle({ x, y: top - boxH, width: boxW, height: boxH, borderColor: RULE, borderWidth: 1 });
          this.page.drawText(item.missing ?? "Not available", {
            x: x + 12,
            y: top - boxH / 2,
            size: 9.5,
            font: this.fonts.regular,
            color: MUTED,
          });
        }
        const caption = wrap(item.caption, this.fonts.semi, 9.5, boxW)[0] ?? "";
        this.page.drawText(caption, { x, y: top - boxH - 14, size: 9.5, font: this.fonts.semi, color: INK });
      });
      this.y = top - boxH - captionH - 8;
    }
  }
}

async function download(bucket: string, filePath: string | null): Promise<Uint8Array | null> {
  if (!filePath) return null;
  const { data, error } = await createAdminClient().storage.from(bucket).download(filePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** PNG or JPEG by content (not the file name); null for anything else. */
async function embedImage(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 4) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

async function buildReportPdf(team: ReportTeam, reg: ReportRegistration): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await loadAssetBytes();
  const fonts: Fonts = {
    regular: await doc.embedFont(bytes.fonts.regular),
    semi: await doc.embedFont(bytes.fonts.semi),
    bold: await doc.embedFont(bytes.fonts.bold),
    display: await doc.embedFont(bytes.fonts.display),
  };
  const logos: Logos = {
    gadgeon: await doc.embedPng(bytes.logos.gadgeon),
    fisat: await doc.embedPng(bytes.logos.fisat),
    ieee: await doc.embedPng(bytes.logos.ieee),
    gignite: await doc.embedPng(bytes.logos.gignite),
  };
  doc.setTitle(`${team.name} (${team.entry_code}) — gIGNITE 2026 team report`);
  doc.setCreator("gIGNITE 2026");

  const members = [...team.team_members].sort((a, b) => a.member_no - b.member_no);
  const leader = members.find((m) => m.is_leader) ?? members[0];
  const site = publicSiteUrl();

  // Fetch everything up front, in parallel.
  const [generatedCards, uploadedCards] = await Promise.all([
    Promise.all(members.map((m) => renderIdCardPng(team.name, m, site).catch(() => null))),
    Promise.all(members.map((m) => download("member-id-cards", m.id_card_path))),
  ]);
  const fileBase = reportFileBase(team.name, team.entry_code);

  const w = new Writer(doc, fonts, logos, `gIGNITE 2026 · ${team.name} · ${team.entry_code} · generated ${formatDate(new Date().toISOString())}`);

  // Team.
  w.wordmark(30);
  w.text("2026 · TEAM REPORT", { font: fonts.bold, size: 9, color: MAGENTA, gap: 6 });
  w.text(team.name, { font: fonts.display, size: 22, gap: 2 });
  w.text(`${team.entry_code} · ${team.ai_theme}`, { font: fonts.semi, size: 11.5, color: MUTED, gap: 6 });

  w.heading("Team");
  w.field("Team ID", team.entry_code);
  w.field("Track", team.ai_theme);
  w.field("College", leader?.college ?? "");
  w.field("District", team.district);
  w.field("Submitted", formatDate(reg.created_at));
  w.field("Verification", VERIFICATION_STATUS_LABELS[reg.verification_status] ?? reg.verification_status);
  w.field("Status", REGISTRATION_STATUS_LABELS[reg.status] ?? reg.status);
  w.field("Ambassador", ambassadorLabel(reg.ambassador_number));
  w.field("Pitch deck", reg.deck_path ? `${deckDownloadName(fileBase, reg.deck_path)} (in the Pitch decks folder)` : "Not uploaded");

  // Members.
  w.heading(`Members (${members.length})`);
  for (const m of members) {
    w.ensure(60);
    w.text(`${m.member_no}. ${m.full_name}${m.is_leader ? " — Team leader" : ""}  ·  ${m.member_code}`, { font: fonts.semi, size: 11 });
    w.text(`${m.email}  ·  ${m.phone}`, { size: 10, color: MUTED, indent: 14 });
    w.text([m.branch, m.year, m.is_leader ? null : m.role_in_team].filter(Boolean).join("  ·  ") || "—", {
      size: 10,
      color: MUTED,
      indent: 14,
      gap: 6,
    });
  }

  // Idea.
  w.heading("Idea");
  const idea: [string, string][] = [
    ["Problem statement", reg.problem_statement],
    ["Proposed solution", reg.proposed_solution],
    ["AI approach / technology", reg.ai_approach],
    ["Expected impact", reg.expected_impact],
  ];
  for (const [label, value] of idea) {
    w.ensure(40);
    w.text(label, { font: fonts.semi, size: 11, gap: 2 });
    w.text(value, { size: 10.5, gap: 10 });
  }
  w.text("Supporting link", { font: fonts.semi, size: 11, gap: 2 });
  w.text(reg.supporting_link || "—", { size: 10.5, gap: 6 });

  // Generated ID cards.
  w.newPage();
  w.heading("gIGNITE ID cards", IMAGE_ROW_H);
  w.imageGrid(
    await Promise.all(
      members.map(async (m, i) => ({
        image: generatedCards[i] ? await embedImage(doc, new Uint8Array(generatedCards[i]!)) : null,
        caption: `${m.full_name} · ${m.member_code}`,
        missing: "Couldn't generate this card",
      })),
    ),
  );

  // Uploaded college ID cards.
  w.heading("College ID cards (uploaded)", IMAGE_ROW_H);
  w.imageGrid(
    await Promise.all(
      members.map(async (m, i) => ({
        image: await embedImage(doc, uploadedCards[i]),
        caption: `${m.full_name} · ${m.member_code}`,
        missing: m.id_card_path ? "Image couldn't be read — open it from the dashboard" : "No ID card uploaded",
      })),
    ),
  );

  // Pitch deck: kept separately, not in this PDF.
  w.heading("Pitch deck");
  if (!reg.deck_path) {
    w.text("No deck uploaded.", { color: MUTED });
  } else {
    w.text(
      `Uploaded as "${deckFileName(reg.deck_path)}". It's in the zip's Pitch decks folder as "${deckDownloadName(fileBase, reg.deck_path)}", and can be opened from the team's page in the dashboard.`,
      { color: MUTED },
    );
  }

  return doc.save();
}
