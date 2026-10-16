"use client";

import { useEffect, useMemo, useRef } from "react";
import { Camera, X } from "lucide-react";

// Re-encodes any phone photo (incl. HEIC) as a JPEG capped at 1600px
async function toJpeg(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Could not read photo"))), "image/jpeg", 0.85));
}

export default function PhotoCapture({ photos, onChange }: { photos: Blob[]; onChange: (p: Blob[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const jpegs = await Promise.all([...files].map((f) => toJpeg(f).catch(() => f)));
    onChange([...photos, ...jpegs]);
  }

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {/* The whole thumbnail is the remove target, so it's a full 80px tap */}
      {urls.map((url, i) => (
        <button key={i} type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white" aria-hidden>
            <X size={12} />
          </span>
        </button>
      ))}
      <button type="button" onClick={() => input.current?.click()}
        className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground">
        <Camera size={20} />
        Photo
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
