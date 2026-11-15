// ── Deal columns ──
// Phone: one stack — the cards being dealt, then the form.
// Desktop (lg+): cards on the left (3/5), the amount / payment form on the
// right (2/5), sticky so Confirm stays in view while the card list grows.
// PosClient's header row uses the same 3/5 · 2/5 split so the columns line up.
export const POS_GRID = "lg:grid lg:grid-cols-5 lg:items-start lg:gap-6";

export default function DealColumns({ children, form }: { children: React.ReactNode; form: React.ReactNode }) {
  return (
    <div className={`space-y-3 lg:space-y-0 ${POS_GRID}`}>
      <div className="space-y-3 lg:col-span-3">{children}</div>
      <div className="lg:sticky lg:top-4 lg:col-span-2">{form}</div>
    </div>
  );
}
