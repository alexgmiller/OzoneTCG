/**
 * Shared card search scoring — used by the server-side search route and
 * the client-side IndexedDB catalog for identical ranking behaviour.
 */

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
  const name    = c.name.toLowerCase();
  const setName = (c.set_name ?? c.set_id ?? "").toLowerCase();
  const num     = (c.card_number ?? "").toLowerCase();
  let score = 0;

  if (name === fullQuery)            score += 100;
  if (name.startsWith(fullQuery))    score += 50;
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

/** Split a raw query into normalised lowercase terms. */
export function parseTerms(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[',\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}
