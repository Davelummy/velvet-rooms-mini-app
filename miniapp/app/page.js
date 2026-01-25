import { Suspense } from "react";
import Home from "./page-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="app-shell">Loading...</div>}>
      <Home />
    </Suspense>
  );
}
