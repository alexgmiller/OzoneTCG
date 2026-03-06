/** Remove all parenthetical groups from a card name and trim whitespace.
 *  "Zekrom (Full art promo)" → "Zekrom"
 *  "Marshadow & Machamp GX (199) (Full Art)" → "Marshadow & Machamp GX"
 */
export function stripParens(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").trim();
}

/**
 * Returns true if the card name is tagged as Japanese.
 * Recognises: "(JP)", "(Japanese)", "(japanese)" anywhere in the name.
 */
export function isJapaneseName(name: string): boolean {
  return /\((JP|Japanese)\)/i.test(name);
}

/**
 * Extract a standalone card number embedded in parentheses in the name.
 *   "Victini EX (131 Full Art)" → "131"
 *   "Gengar (20)" → "20"
 *   "Umbreon (Master Ball Pattern)" → null  (not a number)
 */
export function extractEmbeddedNumber(name: string): string | null {
  const m = name.match(/\((\d+)\b/);
  return m ? m[1] : null;
}

/**
 * Generate all candidate base names to search TCGdex with for a given raw card name.
 * Handles Collectr-style naming conventions:
 *   - Parenthetical suffixes: "(Full art promo)", "(Secret)", "(Prime)", "(199)", "(JP)"
 *   - Embedded promo card numbers: "Pikachu - 208/S-P" → "Pikachu"
 *   - "M " Mega prefix: "M Garchomp EX" → also tries "Mega Garchomp EX"
 *   - Missing hyphens before card type: "Alakazam EX" → also tries "Alakazam-EX"
 */
export function searchBaseNames(raw: string): string[] {
  const trimmed = raw.trim();
  const names = new Set<string>();

  // 1. Original — some TCGdex names may match as-is
  names.add(trimmed);

  // 2. Stripped of all parentheticals: "(Full art promo)", "(JP)", etc.
  const stripped = stripParens(trimmed);
  if (stripped && stripped !== trimmed) names.add(stripped);

  // Use stripped as the base for structural transforms
  const base = stripped || trimmed;

  // 3. Strip embedded promo notation:
  //    "Pikachu - 208/S-P"  → "Pikachu"
  //    "Espeon ex - 175"    → "Espeon ex"  (trailing standalone number)
  //    "Oricorio ex - 024"  → "Oricorio ex"
  const dePromo = base
    .replace(/\s+-\s+\d+\/[\w-]+\s*/g, "")  // "- 208/S-P" style
    .replace(/\s+-\s+\d+\s*$/g, "")          // "- 024" trailing number
    .trim();
  if (dePromo && dePromo !== base) names.add(dePromo);

  // 4. Mega prefix: "M Garchomp EX" → "Mega Garchomp EX"
  //    Guard: must be exactly "M " followed by a word char, not a full name like "Marshadow"
  if (/^M\s+\w/.test(base)) {
    names.add(base.replace(/^M\s+/, "Mega "));
  }

  // 5. Hyphenated card type: "Alakazam EX" → "Alakazam-EX"
  const hyphenated = base.replace(
    /\s+(EX|GX|V|VMAX|VSTAR)(?=\s|$)/g,
    (_, t) => `-${t}`
  );
  if (hyphenated !== base) names.add(hyphenated);

  // 6. Mega + hyphenated combo: "Mega Garchomp EX" → "Mega Garchomp-EX"
  for (const n of [...names]) {
    if (/^Mega\s+/.test(n)) {
      const mh = n.replace(/\s+(EX|GX|V|VMAX|VSTAR)(?=\s|$)/g, (_, t) => `-${t}`);
      if (mh !== n) names.add(mh);
    }
  }

  // 7. Delta species: "Raichu delta species" → "Raichu δ" (TCGdex uses the δ symbol)
  //    Also handles Collectr's parenthetical form: "Jolteon (Delta Species)"
  //    Flatten parens so "Jolteon (Delta Species)" → "Jolteon  Delta Species" → matches regex
  const flatForDelta = trimmed.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const deltaMatch = flatForDelta.match(/^(.+?)\s+delta\s+species\s*$/i)
    ?? base.match(/^(.+?)\s+delta\s+species$/i);
  if (deltaMatch) {
    const baseDelta = deltaMatch[1].replace(/\s+/g, " ").trim();
    names.add(`${baseDelta} δ`);
    names.add(baseDelta);
  }

  return [...names].filter(Boolean);
}

/**
 * Generate case variants for a single base name.
 * Handles users typing lowercase or mixed case.
 *   "mew ex" → ["mew ex", "Mew ex", "Mew Ex"]
 */
export function nameVariants(name: string): string[] {
  const variants = new Set<string>();
  variants.add(name);
  // First letter capitalized: "mew ex" → "Mew ex"
  variants.add(name.charAt(0).toUpperCase() + name.slice(1));
  // Title case: "mew ex" → "Mew Ex"
  variants.add(name.replace(/\b\w/g, (c) => c.toUpperCase()));
  return [...variants];
}
