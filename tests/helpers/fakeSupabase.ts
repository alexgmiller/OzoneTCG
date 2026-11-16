// In-memory stand-in for the Supabase client: enough of the query builder for
// server actions to run end to end in tests. Columns in select() are ignored
// except embeds like "card:items!card_id(owner)".

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export function fakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const table = (name: string) => (tables[name] ??= []);
  const failures = new Set<string>(); // "table:op" pairs that return an error
  const uploads: string[] = [];

  function builder(name: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let embeds: { alias: string; table: string; col: string; fields: string[] }[] = [];
    const filters: Filter[] = [];
    let single: "one" | "maybe" | null = null;
    let limit = Infinity;

    const q = {
      select(cols = "*") {
        embeds = [...cols.matchAll(/(\w+):(\w+)!(\w+)\(([^)]*)\)/g)]
          .map(([, alias, t, col, f]) => ({ alias, table: t, col, fields: f.split(",") }));
        return q;
      },
      insert(p: Row | Row[]) { op = "insert"; payload = p; return q; },
      update(p: Row) { op = "update"; payload = p; return q; },
      delete() { op = "delete"; return q; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return q; },
      gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return q; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
      not(c: string) { filters.push((r) => r[c] != null); return q; }, // only ever .not(col, "is", null)
      order() { return q; },
      limit(n: number) { limit = n; return q; },
      single() { single = "one"; return q; },
      maybeSingle() { single = "maybe"; return q; },
      then<T>(ok: (v: { data: unknown; error: { message: string } | null }) => T, fail?: (e: unknown) => T) {
        return Promise.resolve().then(run).then(ok, fail);
      },
    };

    function run() {
      if (failures.has(`${name}:${op}`)) return { data: null, error: { message: `${name} ${op} failed` } };
      const rows = table(name);
      const match = (r: Row) => filters.every((f) => f(r));
      let out: Row[];
      if (op === "insert") {
        out = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: crypto.randomUUID(), ...r }));
        rows.push(...out);
      } else if (op === "update") {
        out = rows.filter(match);
        for (const r of out) Object.assign(r, payload);
      } else if (op === "delete") {
        out = rows.filter(match);
        tables[name] = rows.filter((r) => !match(r));
      } else {
        out = rows.filter(match).slice(0, limit);
      }
      out = out.map((r) => {
        const copy = { ...r };
        for (const e of embeds) {
          const hit = table(e.table).find((x) => x.id === r[e.col]);
          copy[e.alias] = hit ? Object.fromEntries(e.fields.map((f) => [f, hit[f]])) : null;
        }
        return copy;
      });
      if (single) {
        if (single === "one" && out.length !== 1) return { data: null, error: { message: "expected one row" } };
        return { data: out[0] ?? null, error: null };
      }
      return { data: out, error: null };
    }

    return q;
  }

  const client = {
    from: builder,
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => { uploads.push(`${bucket}/${path}`); return { error: null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
        remove: async (paths: string[]) => { for (const p of paths) uploads.splice(uploads.indexOf(`${bucket}/${p}`), 1); return { error: null }; },
      }),
    },
  };

  return { client, tables, table, failures, uploads };
}
