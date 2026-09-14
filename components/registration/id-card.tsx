"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { memberDisplayCode } from "@/lib/member-code";
import { BrandLogo } from "./ui";

export type IdCardMember = {
  id: string;
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
      a.download = `gignite-id-${memberDisplayCode(member.id)}.png`;
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
        className="flex flex-col gap-4 rounded-[18px] border border-black/[0.08] bg-white p-5 shadow-[0_2px_4px_rgba(44,44,44,0.05),0_16px_34px_rgba(32,65,154,0.09)]"
      >
        <div className="flex items-center justify-between gap-3">
          <BrandLogo className="h-8" />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gignite-blue">
            {memberDisplayCode(member.id)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[17px] font-semibold text-black">{member.full_name}</span>
            <span className="text-[13px] text-gignite-blue">
              {member.role_in_team}
              {member.is_leader ? " · Team Leader" : ""}
            </span>
            <span className="text-[13px] text-gignite-text/80">{teamName}</span>
            <span className="text-[12px] text-gignite-text/70">{member.college}</span>
          </div>
          <div className="flex h-[88px] w-[88px] flex-none items-center justify-center rounded-[10px] bg-gignite-card">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote asset
              <img src={qrDataUrl} alt="Scan at check-in" className="h-full w-full" />
            ) : (
              <span className="font-mono text-[10px] text-gignite-text/50">QR…</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center border-t border-gignite-divider pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- combined IEEE + SPS-KC mark, same hotlink-free local asset used in LogoHeaderBar */}
          <img src="/ieee_sps_kc_logo.png" alt="IEEE Signal Processing Society Kerala Chapter" className="h-8 w-auto" />
        </div>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading || !qrDataUrl}
        className="rounded-[10px] border-[1.5px] border-gignite-border-strong bg-transparent px-4 py-2 font-body text-[13px] font-semibold text-gignite-blue transition-colors hover:border-gignite-blue disabled:cursor-not-allowed disabled:opacity-50"
      >
        {downloading ? "Preparing…" : "Download ID card"}
      </button>
    </div>
  );
}
