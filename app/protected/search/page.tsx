import SearchClient from "./SearchClient";

// ── Search ──
// Card catalog search. ?q= carries the query so Back returns to the results.
type Params = Promise<{ q?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  const { q } = await searchParams;
  return <SearchClient initialQuery={q ?? ""} />;
}
