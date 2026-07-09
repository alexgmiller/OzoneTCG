import * as cheerio from "cheerio";
import type { CardShowRecord, ShowsSource } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const TCDB_URL = "https://www.tcdb.com/CardShows.cfm";

const USER_AGENT =
  "OzoneTCG Shows Aggregator (personal use; contact: alexgmiller00@gmail.com)";

const MAJOR_SHOW_PATTERNS = [
  /\bnational\b/i,              // National Sports Collectors Convention
  /collectacon/i,
  /front\s*row\s*card\s*show/i,
  /card\s*party/i,
  /csa\s*expo/i,
  /dallas\s*card\s*show/i,
  /steel\s*city\s*con/i,
  /motor\s*city\s*comic/i,
  /psa\s*signature/i,
  /tristar/i,
];

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05",     june: "06",     july: "07",  august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function parseDate(raw: string): string | null {
  raw = raw.trim();

  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }

  // Month DD, YYYY  (e.g. "January 15, 2025")
  const longForm = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longForm) {
    const m = MONTH_MAP[longForm[1].toLowerCase()];
    if (m) return `${longForm[3]}-${m}-${longForm[2].padStart(2, "0")}`;
  }

  // MM/DD (no year — assume current or next year)
  const mdNoYear = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mdNoYear) {
    const today = new Date();
    const year = today.getFullYear();
    const candidate = `${year}-${mdNoYear[1].padStart(2, "0")}-${mdNoYear[2].padStart(2, "0")}`;
    return candidate >= today.toISOString().slice(0, 10)
      ? candidate
      : `${year + 1}-${mdNoYear[1].padStart(2, "0")}-${mdNoYear[2].padStart(2, "0")}`;
  }

  return null;
}

// Handles "01/15/2025 - 01/16/2025", "01/15 - 01/16/2025", "01/15/2025"
function parseDateRange(raw: string): { start: string; end: string } | null {
  raw = raw.trim();
  const dashIdx = raw.search(/\s[-–]\s/);
  if (dashIdx === -1) {
    const single = parseDate(raw);
    return single ? { start: single, end: single } : null;
  }

  const leftRaw = raw.slice(0, dashIdx).trim();
  const rightRaw = raw.slice(dashIdx + raw.slice(dashIdx).search(/[^\s\-–]/)).trim();

  let start = parseDate(leftRaw);
  const end = parseDate(rightRaw);

  // If left side has no year but right side does (e.g. "01/15 - 01/16/2025")
  if (!start && end) {
    const yearSuffix = "/" + end.slice(0, 4);
    start = parseDate(leftRaw + yearSuffix);
  }

  if (!start || !end) return null;
  return { start, end };
}

// ── Location helpers ──────────────────────────────────────────────────────────

const US_STATE_ABBRS = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

function parseCityState(raw: string): { city: string; state: string } | null {
  // "Sacramento, CA" or "Sacramento, California"
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length < 2) return null;

  const city = parts[0];
  const stateRaw = parts[parts.length - 1].toUpperCase().replace(/\s+\d+$/, "").trim();

  if (US_STATE_ABBRS.has(stateRaw)) return { city, state: stateRaw };

  // Try full state name → abbreviation (basic subset)
  const fullStateMap: Record<string, string> = {
    "CALIFORNIA": "CA", "TEXAS": "TX", "FLORIDA": "FL", "NEW YORK": "NY",
    "ILLINOIS": "IL", "OHIO": "OH", "GEORGIA": "GA", "MICHIGAN": "MI",
    "PENNSYLVANIA": "PA", "NORTH CAROLINA": "NC", "ARIZONA": "AZ",
    "WASHINGTON": "WA", "COLORADO": "CO", "NEVADA": "NV", "MISSOURI": "MO",
    "INDIANA": "IN", "VIRGINIA": "VA", "TENNESSEE": "TN", "MINNESOTA": "MN",
    "MASSACHUSETTS": "MA", "WISCONSIN": "WI", "MARYLAND": "MD", "OREGON": "OR",
  };
  const abbr = fullStateMap[stateRaw];
  if (abbr) return { city, state: abbr };

  return null;
}

// ── Main scraper ──────────────────────────────────────────────────────────────

function isMajor(name: string): boolean {
  return MAJOR_SHOW_PATTERNS.some((p) => p.test(name));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function scrapeTcdbShows(): Promise<CardShowRecord[]> {
  try {
    const res = await fetch(TCDB_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      // Bypass Next.js data cache — we want a fresh fetch on each cron run
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[tcdb-scraper] HTTP ${res.status} from ${TCDB_URL}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const today = todayStr();
    const shows: CardShowRecord[] = [];

    // TCDB renders shows in a <table> — try to find it robustly.
    // We look for the first table with ≥3 data rows that contains date-like text.
    // Use a string ref to find the table then re-select it
    let targetTableSelector = "";

    $("table").each((idx, tbl) => {
      const t = $(tbl);
      const rows = t.find("tr");
      if (rows.length < 3) return;
      const text = t.text();
      if (/\d{1,2}\/\d{1,2}\/\d{4}|\bJanuary\b|\bFebruary\b|\bMarch\b/i.test(text)) {
        targetTableSelector = `table:nth-of-type(${idx + 1})`;
        return false; // break
      }
    });

    if (!targetTableSelector) {
      console.warn("[tcdb-scraper] Could not find shows table — site structure may have changed");
      return [];
    }

    $(targetTableSelector).find("tr").each((rowIdx, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return; // skip header / empty rows

      // Column heuristic: find the cell that looks like a date range
      let dateRaw = "";
      let nameRaw = "";
      let locationRaw = "";
      let venueRaw = "";
      let linkHref = "";

      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        const isDateCell = /\d{1,2}\/\d{1,2}/.test(text) ||
          /\bJanuary\b|\bFebruary\b|\bMarch\b|\bApril\b|\bMay\b|\bJune\b/i.test(text) ||
          /\bJuly\b|\bAugust\b|\bSeptember\b|\bOctober\b|\bNovember\b|\bDecember\b/i.test(text);
        const isStateCell = /,\s*[A-Z]{2}/.test(text);

        if (i === 0) {
          nameRaw = text;
          const anchor = $(cell).find("a").first();
          if (anchor.length) linkHref = anchor.attr("href") ?? "";
        } else if (isDateCell && !dateRaw) {
          dateRaw = text;
        } else if (isStateCell && !locationRaw) {
          locationRaw = text;
        } else if (!venueRaw && text && !isDateCell && !isStateCell) {
          venueRaw = text;
        }
      });

      if (!nameRaw || !dateRaw) return;

      const dateRange = parseDateRange(dateRaw);
      if (!dateRange) return;
      if (dateRange.end < today) return; // skip past shows

      const location = parseCityState(locationRaw);
      if (!location) return; // can't determine city/state — skip

      const websiteUrl = linkHref
        ? (linkHref.startsWith("http") ? linkHref : `https://www.tcdb.com/${linkHref.replace(/^\//, "")}`)
        : null;

      shows.push({
        name: nameRaw,
        start_date: dateRange.start,
        end_date: dateRange.end,
        venue_name: venueRaw || null,
        venue_address: venueRaw ? `${venueRaw}, ${location.city}, ${location.state}` : null,
        city: location.city,
        state: location.state,
        country: "US",
        latitude: null,
        longitude: null,
        website_url: websiteUrl,
        description: null,
        is_major: isMajor(nameRaw),
        source: "tcdb_scrape",
        source_url: TCDB_URL,
        source_external_id: null,
      });
    });

    console.log(`[tcdb-scraper] Found ${shows.length} upcoming shows`);
    return shows;
  } catch (err) {
    console.error("[tcdb-scraper] Unexpected error:", err);
    return [];
  }
}

// ── ShowsSource implementation ────────────────────────────────────────────────

export class TcdbSource implements ShowsSource {
  readonly name = "tcdb_scrape";

  async fetch(): Promise<CardShowRecord[]> {
    return scrapeTcdbShows();
  }
}
