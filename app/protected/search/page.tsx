import SearchClient from "./SearchClient";

// ── Search ──
// Card catalog search. ?q= carries the query and ?lang=ja the Japanese tab,
// so Back returns to the same results.
type Params = Promise<{ q?: string; lang?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  const { q, lang } = await searchParams;
  return <SearchClient initialQuery={q ?? ""} initialLang={lang === "ja" ? "ja" : "en"} />;
}
