"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { BrandLogo, Spinner } from "./ui";

export type IdCardMember = {
  id: string;
  member_code: string;
  full_name: string;
  is_leader: boolean;
  college: string;
  role_in_team: string | null;
};

/**
 * One team member's gIGNITE ID card — rendered client-side and snapshotted
 * to a downloadable PNG. Deliberately a functional placeholder for the
 * exact visual layout (the real pixel design is a separate future Claude
 * Design pass); this only needs every required field to render and the
 * download mechanism to work. QR encodes this origin's /id/[memberId]
 * route, which every physical/food-token scan will eventually key off of
 * (see id-card-future-phases.md).
 */
export function IdCard({ teamName, member }: { teamName: string; member: IdCardMember }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}/id/${member.id}`;
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const png = await toPng(cardRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = png;
      a.download = `gignite-id-${member.member_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={cardRef}
        // light-scope: the downloaded card is always the printable light version.
        className="light-scope flex flex-col gap-4 overflow-hidden rounded-[20px] border border-ignite-edge/[0.06] bg-ignite-surface p-5 pt-0 font-ui shadow-[0_1px_6px_rgba(0,0,0,0.06)]"
      >
        <div aria-hidden="true" className="-mx-5 h-1.5 bg-brand-gradient" />
        <div className="flex items-center justify-between gap-3">
          <BrandLogo className="h-8" />
          <span className="rounded-full bg-ignite-lavender px-3 py-1 text-[12px] font-bold tracking-[0.08em] text-ignite-ink">
            {member.member_code}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-display text-[18px] font-semibold tracking-[-0.01em] text-ignite-ink">{member.full_name}</span>
            <span className="text-[13px] font-semibold text-ignite-magenta">
              {[member.role_in_team, member.is_leader ? "Team Leader" : null].filter(Boolean).join(" · ")}
            </span>
            <span className="text-[13px] text-ignite-muted">{teamName}</span>
            <span className="text-[12px] text-ignite-muted">{member.college}</span>
          </div>
          <div className="flex h-[88px] w-[88px] flex-none items-center justify-center rounded-[10px] bg-ignite-bg">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote asset
              <img src={qrDataUrl} alt="Scan at check-in" className="h-full w-full" />
            ) : (
              <Spinner className="text-ignite-muted" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-ignite-edge/[0.07] pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- sponsor mark, same hotlink-free local asset used in LogoHeaderBar */}
          <img src="/gadgeon-logo.png" alt="Gadgeon Smart Systems" className="h-10 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element -- combined IEEE + SPS-KC mark, same hotlink-free local asset used in LogoHeaderBar */}
          <img src="/ieee_sps_kc_logo.png" alt="IEEE Signal Processing Society Kerala Chapter" className="h-7 w-auto" />
        </div>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading || !qrDataUrl}
        className="flex items-center justify-center gap-2 rounded-full border border-ignite-ink/70 bg-ignite-surface/60 px-5 py-2.5 font-ui text-[14px] font-semibold text-ignite-ink transition-colors hover:bg-ignite-primary hover:text-ignite-on-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {downloading && <Spinner />}
        {downloading ? "Preparing…" : "Download ID card"}
      </button>
    </div>
  );
}
