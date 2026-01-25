"use client";

import { useEffect, useState } from "react";

export default function Admin() {
  const [section, setSection] = useState("models");
  const [modelView, setModelView] = useState("pending");
  const [contentView, setContentView] = useState("pending");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [initData, setInitData] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let attempts = 0;
    let timeoutId;
    const resolveInitData = () => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        try {
          tg.ready();
          tg.expand();
        } catch {
          // ignore
        }
        if (tg.initData) {
          setInitData(tg.initData);
          return;
        }
      }
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tgData = search.get("tgWebAppData") || hash.get("tgWebAppData");
      if (tgData) {
        setInitData(tgData);
        return;
      }
      attempts += 1;
      if (attempts < 10) {
        timeoutId = setTimeout(resolveInitData, 300);
      }
    };
    resolveInitData();
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!initData) {
        setError("Open the admin console inside Telegram.");
        return;
      }
      setError("");
      let endpoint = "/api/admin/models";
      if (section === "content") endpoint = "/api/admin/content";
      if (section === "escrows") endpoint = "/api/admin/escrows";
      if (section === "payments") endpoint = "/api/admin/payments";
      if (section === "disputes") endpoint = "/api/admin/escrows";
      if (section === "models" && modelView === "approved") {
        endpoint = "/api/admin/models?status=approved";
      }
      if (section === "content" && contentView === "approved") {
        endpoint = "/api/admin/content?status=approved";
      }
      const res = await fetch(endpoint, {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        setError(`Unable to load queue (HTTP ${res.status}).`);
        setItems([]);
        return;
      }
      const payload = await res.json();
      setItems(payload.items || []);
    };
    load();
  }, [section, initData, modelView, contentView]);

  const handleAction = async (action, payload) => {
    if (!initData) {
      setError("Open the admin console inside Telegram.");
      return;
    }
    const res = await fetch(action, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-init": initData },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError(`Action failed (HTTP ${res.status}).`);
      return;
    }
    setError("");
    const refreshed = await fetch(
      section === "content"
        ? "/api/admin/content"
        : section === "escrows"
        ? "/api/admin/escrows"
        : section === "payments"
        ? "/api/admin/payments"
        : "/api/admin/models",
      { headers: { "x-telegram-init": initData } }
    );
    const data = await refreshed.json();
    setItems(data.items || []);
  };

  return (
    <main className="admin-shell">
      <header className="admin-top">
        <div className="brand">
          <span className="brand-dot" />
          Velvet Rooms Admin
        </div>
        <div className="admin-tabs">
          <button
            type="button"
            className={`ghost ${section === "models" ? "active" : ""}`}
            onClick={() => setSection("models")}
          >
            Model Queue
          </button>
          <button
            type="button"
            className={`ghost ${section === "content" ? "active" : ""}`}
            onClick={() => setSection("content")}
          >
            Content Queue
          </button>
          <button
            type="button"
            className={`ghost ${section === "payments" ? "active" : ""}`}
            onClick={() => setSection("payments")}
          >
            Crypto Payments
          </button>
          <button
            type="button"
            className={`ghost ${section === "escrows" ? "active" : ""}`}
            onClick={() => setSection("escrows")}
          >
            Escrow Releases
          </button>
          <button
            type="button"
            className={`ghost ${section === "disputes" ? "active" : ""}`}
            onClick={() => setSection("disputes")}
          >
            Disputes
          </button>
        </div>
      </header>

      <section className="admin-hero">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Creator marketplace control center.</h1>
          <p className="lead">
            Oversee every verification, content approval, session payment, and escrow release.
            This dashboard is the authority for all creator marketplace activity.
          </p>
        </div>
        <div className="admin-metrics">
          <div className="metric">
            <span>Pending models</span>
            <strong>—</strong>
          </div>
          <div className="metric">
            <span>Pending content</span>
            <strong>—</strong>
          </div>
          <div className="metric">
            <span>Held escrows</span>
            <strong>—</strong>
          </div>
          <div className="metric">
            <span>Disputes</span>
            <strong>—</strong>
          </div>
        </div>
      </section>

      <section className="admin-insights">
        <div className="insight-card">
          <h3>Revenue Pulse</h3>
          <p>Escrow inflow (rolling 7 days)</p>
          <div className="sparkline">
            {Array.from({ length: 18 }).map((_, idx) => (
              <span key={`rev-${idx}`} style={{ height: `${30 + (idx % 6) * 10}%` }} />
            ))}
          </div>
          <div className="insight-foot">
            <span>Platform share</span>
            <strong>20%</strong>
          </div>
        </div>
        <div className="insight-card">
          <h3>Queue Velocity</h3>
          <p>Approvals closed today</p>
          <div className="sparkline alt">
            {Array.from({ length: 18 }).map((_, idx) => (
              <span key={`queue-${idx}`} style={{ height: `${40 + (idx % 5) * 9}%` }} />
            ))}
          </div>
          <div className="insight-foot">
            <span>Median review time</span>
            <strong>—</strong>
          </div>
        </div>
        <div className="insight-card">
          <h3>Risk Signals</h3>
          <p>Flags and disputes (24h)</p>
          <div className="signal-stack">
            <div>
              <span>High‑risk flags</span>
              <strong>—</strong>
            </div>
            <div>
              <span>Payment retries</span>
              <strong>—</strong>
            </div>
            <div>
              <span>Chargeback risk</span>
              <strong>—</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <aside className="admin-panel">
          <h2>
            {section === "models"
              ? "Model Verification"
              : section === "content"
              ? "Content Moderation"
              : section === "payments"
              ? "Crypto Payment Review"
              : section === "escrows"
              ? "Manual Releases"
              : "Dispute Desk"}
          </h2>
          <p>
            {section === "models"
              ? "Review verification video, approve or reject, then unlock model tools."
              : section === "content"
              ? "Approve teasers before they appear in the gallery."
              : section === "payments"
              ? "Approve crypto payments before escrows are created."
              : section === "escrows"
              ? "Release or refund escrow funds manually."
              : "Resolve disputes with a full audit trail."}
          </p>
          {section === "models" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${modelView === "pending" ? "primary" : "ghost"}`}
                onClick={() => setModelView("pending")}
              >
                Pending models
              </button>
              <button
                type="button"
                className={`cta ${modelView === "approved" ? "primary" : "ghost"}`}
                onClick={() => setModelView("approved")}
              >
                Approved models
              </button>
            </div>
          )}
          {section === "content" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${contentView === "pending" ? "primary" : "ghost"}`}
                onClick={() => setContentView("pending")}
              >
                Pending content
              </button>
              <button
                type="button"
                className={`cta ${contentView === "approved" ? "primary" : "ghost"}`}
                onClick={() => setContentView("approved")}
              >
                Approved content
              </button>
            </div>
          )}
          <div className="panel-actions">
            <button type="button" className="cta primary">
              Open live queue
            </button>
            <button type="button" className="cta ghost">
              Export audit log
            </button>
          </div>
          <div className="admin-pill">Manual approvals only • 18+ content</div>
        </aside>

        <div className="admin-list">
          {error && <div className="empty">{error}</div>}
          {!error && (
            <div className="empty subtle">Live queue updates when new submissions arrive.</div>
          )}
          {!error && items.length === 0 && (
            <div className="empty">Queue is empty.</div>
          )}
          {!error &&
            items.map((item) => (
              <article
                key={item.user_id || item.id || item.escrow_ref || item.transaction_ref}
                className="queue-card"
              >
                <div>
                  <p className="queue-id">
                    {item.public_id ||
                      item.escrow_ref ||
                      item.transaction_ref ||
                      item.id}
                  </p>
                  <h3>{item.display_name || item.title || item.escrow_type || "Payment"}</h3>
                  <p className="queue-meta">
                    {section === "models" &&
                      (modelView === "approved" ? "Verified model" : "Verification pending")}
                    {section === "content" && "Content awaiting approval"}
                    {section === "payments" &&
                      `Crypto · ${item.amount} · ${item.metadata_json?.crypto_tx_hash || "hash pending"}`}
                    {section === "escrows" && `Held escrow · ${item.amount}`}
                  </p>
                </div>
                <div className="queue-actions">
                  {section === "models" && modelView === "pending" && (
                    <>
                      <div className={`status-pill ${item.is_online ? "live" : "idle"}`}>
                        {item.is_online ? "Online" : "Offline"}
                      </div>
                      <button
                        type="button"
                        className="cta primary"
                        onClick={() =>
                          handleAction("/api/admin/models/approve", {
                            user_id: item.user_id,
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="cta primary alt"
                        onClick={() =>
                          handleAction("/api/admin/models/reject", {
                            user_id: item.user_id,
                          })
                        }
                      >
                        Reject
                      </button>
                      {item.verification_video_url && (
                        <a
                          className="cta ghost"
                          href={item.verification_video_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View video
                        </a>
                      )}
                    </>
                  )}
                  {section === "models" && modelView === "approved" && (
                    <>
                      <div className={`status-pill ${item.is_online ? "live" : "idle"}`}>
                        {item.is_online ? "Online" : "Offline"}
                      </div>
                      <div className="status-pill live">Verified</div>
                    </>
                  )}
                  {section === "content" && (
                    <>
                      {item.preview_url && (
                        <a
                          className="cta ghost"
                          href={item.preview_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View preview
                        </a>
                      )}
                      {contentView === "pending" && (
                        <>
                          <button
                            type="button"
                            className="cta primary"
                            onClick={() =>
                              handleAction("/api/admin/content/approve", {
                                content_id: item.id,
                              })
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="cta primary alt"
                            onClick={() =>
                              handleAction("/api/admin/content/reject", {
                                content_id: item.id,
                              })
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={() =>
                          handleAction("/api/admin/content/delete", {
                            content_id: item.id,
                          })
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {section === "escrows" && (
                    <>
                      <button
                        type="button"
                        className="cta primary"
                        onClick={() =>
                          handleAction("/api/admin/escrows/release", {
                            escrow_ref: item.escrow_ref,
                          })
                        }
                      >
                        Release
                      </button>
                      <button
                        type="button"
                        className="cta primary alt"
                        onClick={() =>
                          handleAction("/api/admin/escrows/refund", {
                            escrow_ref: item.escrow_ref,
                          })
                        }
                      >
                        Refund
                      </button>
                    </>
                  )}
                  {section === "payments" && (
                    <>
                      <div className="status-pill live">
                        {(item.metadata_json?.crypto_currency || "CRYPTO") +
                          " " +
                          (item.metadata_json?.crypto_network || "")}
                      </div>
                      <button
                        type="button"
                        className="cta primary"
                        onClick={() =>
                          handleAction("/api/admin/payments/approve", {
                            transaction_ref: item.transaction_ref,
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="cta primary alt"
                        onClick={() =>
                          handleAction("/api/admin/payments/reject", {
                            transaction_ref: item.transaction_ref,
                          })
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
        </div>
      </section>
    </main>
  );
}
