// Supabase returns at most 1000 rows per request; page until a short page comes back.

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(
  query: (from: number, to: number) => Page<T>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}
