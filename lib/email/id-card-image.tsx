import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";

/**
 * A member's gIGNITE ID card as a PNG, drawn on the server for the
 * registration email. Mirrors the card on the status page
 * (components/registration/id-card.tsx, light version) and its QR encodes
 * the same <participant site>/id/<member id> link, so either can be scanned
 * at check-in. The fonts and logos are bundled with the function via
 * outputFileTracingIncludes in next.config.mjs.
 */

export type IdCardImageMember = {
  id: string;
  member_code: string;
  full_name: string;
  is_leader: boolean;
  college: string;
  role_in_team: string | null;
};

// Laid out at the on-site card's size, rendered at 2× for a sharp image.
const S = 2;
const WIDTH = 400 * S;
// Fits one line each for name, team and college; taller when they wrap.
const BASE_HEIGHT = 262;

/** Rough wrapped-line count for the text column (~240px wide). */
function lines(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

const INK = "#2C1D44";
const MUTED = "#6A7282";
const MAGENTA = "#C756D9";
const LAVENDER = "#F2F0F8";
const BG = "#F4F6FA";

type Assets = {
  fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[];
  logo: string;
  gadgeon: string;
  ieee: string;
};

let assets: Promise<Assets> | null = null;

function loadAssets(): Promise<Assets> {
  assets ??= (async () => {
    const root = process.cwd();
    const font = (file: string) => readFile(path.join(root, "lib/email/fonts", file));
    const png = async (file: string) =>
      `data:image/png;base64,${(await readFile(path.join(root, "public", file))).toString("base64")}`;
    const [soraSemi, urbanist, urbanistSemi, urbanistBold, logo, gadgeon, ieee] = await Promise.all([
      font("Sora-SemiBold.ttf"),
      font("Urbanist-Regular.ttf"),
      font("Urbanist-SemiBold.ttf"),
      font("Urbanist-Bold.ttf"),
      png("gignite-logo.png"),
      png("gadgeon-logo.png"),
      png("ieee_sps_kc_logo.png"),
    ]);
    return {
      fonts: [
        { name: "Sora", data: soraSemi, weight: 600, style: "normal" },
        { name: "Urbanist", data: urbanist, weight: 400, style: "normal" },
        { name: "Urbanist", data: urbanistSemi, weight: 600, style: "normal" },
        { name: "Urbanist", data: urbanistBold, weight: 700, style: "normal" },
      ],
      logo,
      gadgeon,
      ieee,
    };
  })();
  assets.catch(() => {
    assets = null;
  });
  return assets;
}

export async function renderIdCardPng(teamName: string, member: IdCardImageMember, siteUrl: string): Promise<Buffer> {
  const [{ fonts, logo, gadgeon, ieee }, qr] = await Promise.all([
    loadAssets(),
    QRCode.toDataURL(`${siteUrl}/id/${member.id}`, { width: 88 * S * 2, margin: 1 }),
  ]);
  const role = [member.role_in_team, member.is_leader ? "Team Leader" : null].filter(Boolean).join(" · ");
  // The college line is already allowed two lines in BASE_HEIGHT.
  const extraHeight =
    (lines(member.full_name, 22) - 1) * 24 +
    (lines(teamName, 34) - 1) * 18 +
    Math.max(0, lines(member.college, 38) - 2) * 17;
  const height = (BASE_HEIGHT + extraHeight) * S;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#FFFFFF",
          fontFamily: "Urbanist",
          color: INK,
        }}
      >
        <div
          style={{
            display: "flex",
            height: 6 * S,
            backgroundImage: "linear-gradient(90deg, #F47920 0%, #C756D9 50%, #3182FC 100%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${16 * S}px ${20 * S}px ${14 * S}px` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
            <img src={logo} width={124 * S} height={32 * S} alt="" />
            <div
              style={{
                display: "flex",
                backgroundColor: LAVENDER,
                borderRadius: 999,
                padding: `${4 * S}px ${12 * S}px`,
                fontSize: 12 * S,
                fontWeight: 700,
                letterSpacing: 0.96 * S,
              }}
            >
              {member.member_code}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: 12 * S, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 16 * S }}>
              <div style={{ display: "flex", fontFamily: "Sora", fontWeight: 600, fontSize: 18 * S, letterSpacing: -0.18 * S }}>
                {member.full_name}
              </div>
              {role && (
                <div style={{ display: "flex", marginTop: 4 * S, fontSize: 13 * S, fontWeight: 600, color: MAGENTA }}>
                  {role}
                </div>
              )}
              <div style={{ display: "flex", marginTop: 4 * S, fontSize: 13 * S, color: MUTED }}>{teamName}</div>
              <div style={{ display: "flex", marginTop: 4 * S, fontSize: 12 * S, color: MUTED }}>{member.college}</div>
            </div>
            <div
              style={{
                display: "flex",
                width: 88 * S,
                height: 88 * S,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: BG,
                borderRadius: 10 * S,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
              <img src={qr} width={88 * S} height={88 * S} alt="" />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 14 * S,
              paddingTop: 12 * S,
              borderTop: `${S}px solid #EDEDED`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
            <img src={gadgeon} width={120 * S} height={40 * S} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
            <img src={ieee} width={87 * S} height={28 * S} alt="" />
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height, fonts },
  );
  return Buffer.from(await image.arrayBuffer());
}
