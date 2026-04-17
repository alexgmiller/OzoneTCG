// Client-side only — uses browser APIs (canvas, Image) and dynamic import of Tesseract.js.
// Never import this module from server-side code.

export type OcrCardResult = {
  name: string;
  cardNumber: string;
  setText: string;
  confidence: number; // 0–1
};

// ── Worker singleton ──────────────────────────────────────────────────────────
// One Tesseract worker is initialized on first scan and reused for all
// subsequent scans.  The promise is cached so concurrent calls share the same
// initialization path.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerPromise: Promise<any> | null = null;

async function getTesseractWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      // OEM 1 = LSTM only (fastest + most accurate for modern card fonts)
      const worker = await createWorker("eng", 1, {
        // Suppress verbose logger output in production
        logger: () => {},
      });
      // PSM 11 = sparse text — best for cards where text is scattered across regions
      const { PSM } = await import("tesseract.js");
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })().catch((err) => {
      // Reset so the next call retries initialization
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// ── Image pre-processing ──────────────────────────────────────────────────────
/**
 * Upscale small images, convert to grayscale, and apply aggressive contrast
 * stretching.  Both steps substantially improve Tesseract accuracy on shiny /
 * holographic cards where colour noise confuses character recognition.
 */
function preprocessForOcr(imageBase64: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Upscale so the shortest side is at least 800 px — OCR degrades below ~600 px
      const minDim = 800;
      const scale = Math.max(1, minDim / Math.min(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Pixel-level grayscale + contrast boost
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      // Contrast factor 2.2: aggressive enough to pop text off holo backgrounds
      const k = 2.2;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const c = Math.min(255, Math.max(0, k * (gray - 128) + 128));
        d[i] = d[i + 1] = d[i + 2] = c;
        // alpha untouched
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${imageBase64}`;
  });
}

// ── Text parsers ──────────────────────────────────────────────────────────────

/**
 * Card number patterns (most-specific first):
 *   TG01/TG30, GG01/GG70, RC01/RC32  — gallery / special subsets
 *   123/456                           — standard set number
 *   SWSH001, SV049                    — promo codes
 *   A1/A2 style handled by first group
 */
const CARD_NUMBER_RE =
  /\b([A-Z]{1,4}\d{2,4}\/[A-Z]{0,4}\d{2,4}|\d{1,3}\/\d{1,3}|[A-Z]{2,4}\d{3,4})\b/g;

/** Common card UI strings that Tesseract picks up — never treat as a card name */
const NAME_BLOCKLIST = new Set([
  "hp", "basic", "stage", "evolves", "ability", "attack", "retreat",
  "weakness", "resistance", "pokemon", "trainer", "energy", "item",
  "supporter", "stadium", "tool", "special", "prize", "damage", "coin",
  "flip", "discard", "deck", "hand", "bench", "active", "illustrator",
  "null", "none", "rule", "box", "you", "your", "this", "card", "cards",
]);

/**
 * Pick the most likely card name from the OCR line list.
 *
 * Heuristics (applied in order):
 *  1. 2–30 chars after trimming
 *  2. Starts with an uppercase letter (names are always title-cased / all-caps)
 *  3. First word not on the blocklist
 *  4. ≤25 % "noise" characters (non-alphanumeric / non-space)
 *  5. Contains at least one 3-char alphabetic run
 */
function extractCardName(lines: string[]): string {
  for (const line of lines) {
    const clean = line.trim();
    if (clean.length < 2 || clean.length > 30) continue;
    if (!/^[A-Z]/.test(clean)) continue;

    const firstWord = clean.toLowerCase().split(/\s+/)[0];
    if (NAME_BLOCKLIST.has(firstWord)) continue;

    const noiseChars = (clean.match(/[^a-zA-Z0-9\s\-'.]/g) ?? []).length;
    if (noiseChars / clean.length > 0.25) continue;

    if (!/[a-zA-Z]{3}/.test(clean)) continue;

    return clean;
  }
  return "";
}

function extractCardNumber(text: string): string {
  const matches = [...text.matchAll(CARD_NUMBER_RE)];
  if (!matches.length) return "";
  // Prefer standard "123/456" over promo codes when both present
  const standard = matches.find((m) => /^\d+\/\d+$/.test(m[1]));
  return (standard ?? matches[0])[1];
}

/**
 * Extract a set hint from the line that contains the card number.
 * Cards typically print the set abbreviation alongside the collector number.
 */
function extractSetText(lines: string[], cardNumber: string): string {
  if (!cardNumber) return "";
  for (const line of lines) {
    if (!line.includes(cardNumber)) continue;
    const rest = line
      .replace(cardNumber, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .trim();
    const words = rest
      .split(/\s+/)
      .filter((w) => w.length >= 2 && w.length <= 25 && /[a-zA-Z]/.test(w));
    if (words.length) return words.join(" ");
  }
  return "";
}

// ── Confidence scoring ────────────────────────────────────────────────────────
/**
 * Blend field-extraction success with Tesseract's raw confidence.
 *
 * Weight breakdown:
 *   name found      → +0.50
 *   cardNumber found → +0.30
 *   setText found   → +0.10
 *   total field score × 0.6 + tesseract confidence × 0.4
 */
function calcConfidence(
  name: string,
  cardNumber: string,
  setText: string,
  ocrConfRaw: number // 0–100 from Tesseract
): number {
  const fieldScore = (name ? 0.5 : 0) + (cardNumber ? 0.3 : 0) + (setText ? 0.1 : 0);
  const ocrConf = ocrConfRaw / 100;
  return fieldScore > 0
    ? Math.min(0.99, fieldScore * 0.6 + ocrConf * 0.4)
    : ocrConf * 0.3;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: kick off Tesseract worker initialization and traineddata
 * download in the background.  Call this when the app reaches a state where
 * a scan is likely soon (e.g. an active show session) so the worker is warm
 * by the time the user first opens the scanner.  Failures are silently
 * swallowed — the scanner will retry initialization on first actual use.
 */
export function preloadOcrWorker(): void {
  getTesseractWorker().catch(() => {});
}

/**
 * Run on-device OCR against a JPEG base64 string and extract card fields.
 * Call this from a "use client" component only.
 *
 * The Tesseract worker is initialized once and reused — subsequent calls
 * complete in ~500 ms vs ~2 s for first-time initialization.
 */
export async function ocrReadCard(imageBase64: string): Promise<OcrCardResult> {
  const [processedCanvas, worker] = await Promise.all([
    preprocessForOcr(imageBase64),
    getTesseractWorker(),
  ]);

  const { data } = await worker.recognize(processedCanvas);
  const rawText: string = data.text ?? "";
  const ocrConfRaw: number = data.confidence ?? 0;

  const lines = rawText
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const cardNumber = extractCardNumber(rawText);
  const name = extractCardName(lines);
  const setText = extractSetText(lines, cardNumber);
  const confidence = calcConfidence(name, cardNumber, setText, ocrConfRaw);

  return { name, cardNumber, setText, confidence };
}
