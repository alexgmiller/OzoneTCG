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
    <div className="flex gap-2 overflow-x-auto">
      {urls.map((url, i) => (
        <div key={i} className="relative w-16 h-16 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border" />
          <button type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center">
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => input.current?.click()}
        className="w-16 h-16 shrink-0 rounded-lg border border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground">
        <Camera size={18} />Photo
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
