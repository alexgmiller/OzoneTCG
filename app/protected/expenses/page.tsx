import { Suspense } from "react";
import ExpensesServer from "./ExpensesServer";
import ExpensesLoading from "./loading";

export default function ExpensesPage() {
  return (
    <Suspense fallback={<ExpensesLoading />}>
      <ExpensesServer />
    </Suspense>
  );
}
