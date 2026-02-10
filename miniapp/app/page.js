import { Suspense } from "react";
import Home from "./page-client";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <div className="loading-card">
            <div className="brand brand-logo-only">
              <span className="logo-mark">
                <img src="/brand/logo.png" alt="Velvet Rooms logo" />
              </span>
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
