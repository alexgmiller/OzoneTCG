"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  src: string | null | undefined;
  name: string;
  setName?: string | null;
  cardNumber?: string | null;
  className?: string;
  /** If provided, the placeholder shows an upload button */
  onUpload?: (file: File) => Promise<void>;
  /** If provided, shows a small flag button on the image for reporting incorrect images */
  onReport?: () => Promise<void>;
  /** Show an "Unverified" badge — for images that came from automated sources */
  unverified?: boolean;
};

/**
 * Smart card image component.
 * Shows the card image if available, otherwise renders a styled placeholder.
 * If onUpload is provided, the placeholder has a tap-to-upload button.
 */
export default function CardImage({ src, name, setName, cardNumber, className = "", onUpload, onReport, unverified }: Props) {
  const [failed, setFailed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  const handleReport = useCallback(async () => {
    if (!onReport || reporting || reported) return;
    setReporting(true);
    try {
      await onReport();
      setReported(true);
    } finally {
      setReporting(false);
    }
  }, [onReport, reporting, reported]);

  if (src && !failed) {
    return (
      <div className={`relative group ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="w-full h-auto rounded-lg"
          onError={() => setFailed(true)}
        />
        {/* Unverified badge */}
        {unverified && (
          <span className="absolute top-1 left-1 text-[8px] font-semibold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 pointer-events-none">
            Unverified
          </span>
        )}
        {/* Report button — visible on hover */}
        {onReport && !reported && (
          <button
            type="button"
            onClick={handleReport}
            disabled={reporting}
            title="Report wrong image"
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-black/60 text-white/70 hover:text-white flex items-center justify-center"
          >
            {reporting ? (
              <span className="text-[8px] animate-spin">⟳</span>
            ) : (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
                <path d="M1.5 1h4.5l-1 2 1 2H2.5L1.5 1zM1.5 1v7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
              </svg>
            )}
          </button>
        )}
        {reported && (
          <span className="absolute top-1 right-1 text-[8px] font-semibold px-1 py-0.5 rounded bg-rose-500/20 text-rose-400">
            Reported
          </span>
        )}
      </div>
    );
  }

  return (
    <CardPlaceholder
      name={name}
      setName={setName}
      cardNumber={cardNumber}
      className={className}
      onUpload={onUpload}
    />
  );
}

function CardPlaceholder({
  name,
  setName,
  cardNumber,
  className = "",
  onUpload,
}: Pick<Props, "name" | "setName" | "cardNumber" | "className" | "onUpload">) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
      setDone(true);
    } catch {
      // silent — inventory will show the result on next render
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className={`w-full aspect-[5/7] rounded-lg relative overflow-hidden flex flex-col items-center justify-between p-2 select-none ${className}`}
      style={{
        background: "linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--muted)/0.6) 100%)",
        border: "1px solid hsl(var(--border))",
      }}
    >
      {/* Decorative large initials */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
        <span className="text-7xl font-black opacity-[0.06] leading-none tracking-tighter">
          {initials}
        </span>
      </div>

      {/* Top row: card number + upload button */}
      <div className="w-full flex items-start justify-between z-10">
        {cardNumber ? (
          <span className="text-[8px] font-mono bg-background/40 text-foreground/50 px-1.5 py-0.5 rounded-full">
            {cardNumber}
          </span>
        ) : <span />}

        {onUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              title="Upload image"
              disabled={uploading || done}
              onClick={() => inputRef.current?.click()}
              className="w-6 h-6 rounded-full bg-background/60 border border-border flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-background/90 transition-colors disabled:opacity-40"
            >
              {uploading ? (
                <span className="animate-spin text-[10px]">⟳</span>
              ) : done ? (
                <span className="text-[10px] text-green-600">✓</span>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 7V3M3 5l2-2 2 2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 8.5h8" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      {/* Center: card name */}
      <div className="flex-1 flex items-center justify-center z-10 px-1">
        <p className="text-center text-xs font-semibold text-foreground/70 leading-snug line-clamp-3">
          {name}
        </p>
      </div>

      {/* Bottom: set name */}
      {setName && (
        <div className="z-10 w-full">
          <p className="text-center text-[8px] text-foreground/40 truncate leading-none">{setName}</p>
        </div>
      )}
    </div>
  );
}
