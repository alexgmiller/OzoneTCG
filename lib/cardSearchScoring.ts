/**
 * Shared card search scoring — used by the server-side search route and
 * the client-side IndexedDB catalog for identical ranking behaviour.
 */

/**
 * Lowercase with accents removed, so "pokemon catcher" matches "Pokémon
 * Catcher" and "flabebe" matches "Flabébé". Recomposes afterwards, so
 * Japanese kana with voiced marks (ガ) stay single characters.
 */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").toLowerCase();
}

/**
 * ILIKE pattern for the indexed name lookup. Postgres compares accents
 * literally, so in a term of 4+ letters each "e" becomes the one-character
 * wildcard and "pokemon" also finds "Pokémon"; the folded post-filter then
 * drops anything that only matched loosely. Short terms ("ex") stay exact.
 */
export function nameLike(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (c) => "\\" + c);
  return `%${term.length >= 4 ? escaped.replace(/e/g, "_") : escaped}%`;
}

export type ScoredCard = {
  name: string;
  set_name: string | null;
  set_id?: string | null;
  card_number: string | null;
};

/**
 * Score a card against parsed search terms + full query string.
 * Higher score = better match. 0 = no match.
 */
export function scoreLocalCard(c: ScoredCard, terms: string[], fullQuery: string): number {
  const name    = fold(c.name);
  const setName = fold(c.set_name ?? c.set_id ?? "");
  const num     = fold(c.card_number ?? "");
  const full    = fold(fullQuery).trim();
  let score = 0;

  if (name === full)                 score += 100;
  if (name.startsWith(full))         score += 50;
  if (terms.length > 0 && name.startsWith(terms[0])) score += 20;

  for (const term of terms) {
    const numClean = term.replace(/^0+/, "");
    if (name === term)               score += 30;
    if (name.startsWith(term))       score += 10;
    if (name.includes(term))         score += 5;
    if (setName.includes(term))      score += 3;
    if (numClean && num === numClean) score += 25;
    else if (numClean && /^\d/.test(numClean) && num.startsWith(numClean)) score += 12;
  }

  return score;
}

/** Split a raw query into lowercase, accent-free terms. */
export function parseTerms(raw: string): string[] {
  return fold(raw)
    .replace(/[',\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}

// Terms to try for the indexed name lookup, best guess first: the longest
// ones with a letter in them ("charizard" beats "ex" and "4"). A set word can
// be longer than the name ("charizard evolutions"), so the search tries the
// next one when a term finds nothing. Empty when there is nothing to search.
export function nameTerms(rawQuery: string, max = 3): string[] {
  const terms = [...new Set(parseTerms(rawQuery))];
  const lettered = terms.filter((t) => /[a-z]/i.test(t)).sort((a, b) => b.length - a.length);
  return (lettered.length ? lettered : terms).slice(0, max);
}
