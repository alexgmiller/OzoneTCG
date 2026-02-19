import { Suspense } from "react";
import ExpensesServer from "./ExpensesServer";

export default function ExpensesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading expenses…</div>}>
      <ExpensesServer />
    </Suspense>
  );
}
