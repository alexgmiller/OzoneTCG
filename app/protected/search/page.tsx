import SearchClient from "./SearchClient";

// ── Search ──
// Card catalog search. ?q= carries the query, ?set= an open set (Browse sets)
// and ?lang=ja the Japanese tab, so Back returns to the same results.
type Params = Promise<{ q?: string; lang?: string; set?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  const { q, lang, set } = await searchParams;
  const setId = Number(set);
  return (
    <SearchClient
      initialQuery={q ?? ""}
      initialLang={lang === "ja" ? "ja" : "en"}
      initialSet={Number.isInteger(setId) && setId > 0 ? setId : null}
    />
  );
}
