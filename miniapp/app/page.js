import { Suspense } from "react";
import Home from "./page-client";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <div className="loading-card">
            <div className="brand">
              <span className="brand-dot" />
              <span className="logo-text">Velvet Rooms</span>
            </div>
            <div className="spinner" />
            <p className="helper">Loading your experience…</p>
          </div>
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}
