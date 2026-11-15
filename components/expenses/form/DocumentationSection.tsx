"use client";

import { Camera, CheckCircle2, FileText, Info, WifiOff, X } from "lucide-react";
import type { ExpenseCategory } from "@/app/protected/expenses/actions";
import { Button, Chip, SectionHeader, Textarea } from "@/components/ui";
import {
  CATEGORY_DOC_TIPS, LINK_BTN, PHOTO_DOC_TYPES,
  type PhotoDocType,
} from "./shared";

// ── Documentation section (photo / note / skip) ───────────────────────────────

export function DocumentationSection({
  category,
  isOnline,
  displayPhotoUrl,
  notes,
  photoDocType,
  receiptError,
  noteMode,
  docSkipped,
  onPickPhoto,
  onClearPhoto,
  onPhotoDocType,
  onNoteChange,
  onClearNote,
  onStartNote,
  onSkip,
}: {
  category: ExpenseCategory;
  isOnline: boolean;
  displayPhotoUrl: string | null;
  notes: string;
  photoDocType: PhotoDocType;
  receiptError: string | null;
  noteMode: boolean;
  docSkipped: boolean;
  onPickPhoto: () => void;
  onClearPhoto: () => void;
  onPhotoDocType: (t: PhotoDocType) => void;
  onNoteChange: (v: string) => void;
  onClearNote: () => void;
  onStartNote: () => void;
  onSkip: (skipped: boolean) => void;
}) {
  const hasPhoto = displayPhotoUrl !== null;
  const hasNote = notes.trim().length > 0;
  const hasAnyDoc = hasPhoto || hasNote;
  const categoryTip = category !== "mileage" ? CATEGORY_DOC_TIPS[category] : null;

  return (
    <div className="space-y-2">
      <SectionHeader action={<span className="text-xs text-muted-foreground">Proof for tax records</span>}>
        Documentation
      </SectionHeader>

      {category === "mileage" ? (
        <div className="flex items-start gap-2 rounded-lg border border-accent-primary-border bg-accent-primary-soft px-3 py-2.5 text-xs">
          <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="leading-relaxed text-muted-foreground">
            Mileage expenses are documented by your mileage log — no receipt needed.
          </span>
        </div>
      ) : !isOnline ? (
        <div className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
          <WifiOff size={14} />
          Documentation upload requires a connection
        </div>
      ) : (
        <div className="space-y-2">
          {receiptError && <p className="text-xs text-negative">{receiptError}</p>}

          {/* Nothing attached, not skipped: three options */}
          {!hasAnyDoc && !docSkipped && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onPickPhoto} className="flex-1">
                <Camera size={16} /> Photo
              </Button>
              <Button variant="outline" size="sm" onClick={onStartNote} className="flex-1">
                <FileText size={16} /> Note
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSkip(true)}
                className="flex-1 text-muted-foreground"
              >
                Skip
              </Button>
            </div>
          )}

          {/* Skipped, nothing attached */}
          {!hasAnyDoc && docSkipped && (
            <div className="flex h-11 items-center justify-between rounded-lg border border-border bg-muted px-3 text-xs">
              <span className="text-muted-foreground">No documentation</span>
              <Button
                variant="link"
                onClick={() => onSkip(false)}
                className="h-11 px-2 text-xs"
              >
                Undo
              </Button>
            </div>
          )}

          {/* Photo attached */}
          {hasPhoto && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayPhotoUrl!}
                  alt="Documentation"
                  className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                />
                <div className="flex flex-1 items-center gap-1.5 text-xs text-positive">
                  <CheckCircle2 size={14} /> Attached
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClearPhoto}
                  className="shrink-0"
                  aria-label="Remove photo"
                >
                  <X size={16} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PHOTO_DOC_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    size="sm"
                    selected={photoDocType === t.value}
                    onClick={() => onPhotoDocType(t.value)}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
              {!hasNote && !noteMode && (
                <button type="button" onClick={onStartNote} className={LINK_BTN}>
                  <FileText size={14} /> Also add a written note
                </button>
              )}
            </div>
          )}

          {/* Note textarea */}
          {(noteMode || hasNote) && (
            <div className="space-y-1.5">
              {!hasPhoto && (
                <div className="flex items-center gap-1.5 text-xs text-positive">
                  <FileText size={14} />
                  {hasNote ? "Written record" : "Add a written record"}
                </div>
              )}
              <Textarea
                className={`min-h-24 resize-none leading-relaxed ${hasNote ? "border-positive-border" : ""}`}
                placeholder="What happened? Who did you pay? Example: 'Paid John Smith $150 cash at Sacramento show for shared booth space. His phone: 555-1234.'"
                value={notes}
                onChange={(e) => onNoteChange(e.target.value)}
                autoFocus={noteMode && !hasNote}
              />
              <div className="flex items-center justify-between">
                {!hasPhoto && (
                  <button type="button" onClick={onPickPhoto} className={LINK_BTN}>
                    <Camera size={14} /> Also add a photo
                  </button>
                )}
                <button type="button" onClick={onClearNote} className={`${LINK_BTN} ml-auto`}>
                  Remove note
                </button>
              </div>
            </div>
          )}

          {/* Note only, not editing: offer photo */}
          {hasNote && !hasPhoto && !noteMode && (
            <button type="button" onClick={onPickPhoto} className={LINK_BTN}>
              <Camera size={14} /> Also add a photo
            </button>
          )}

          {categoryTip && !hasAnyDoc && (
            <p className="text-xs italic leading-relaxed text-muted-foreground">{categoryTip}</p>
          )}
        </div>
      )}
    </div>
  );
}
