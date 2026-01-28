"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export default function Admin() {
  const [section, setSection] = useState("models");
  const [modelView, setModelView] = useState("pending");
  const [contentView, setContentView] = useState("pending");
  const [paymentView, setPaymentView] = useState("pending");
  const [escrowView, setEscrowView] = useState("pending");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [initData, setInitData] = useState("");
  const [liveQueue, setLiveQueue] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [preview, setPreview] = useState({ open: false, url: "", type: "video" });
  const [metrics, setMetrics] = useState({
    pending_models: 0,
    approved_models: 0,
    total_models: 0,
    online_models: 0,
    pending_content: 0,
    approved_content: 0,
    total_content: 0,
    held_escrows: 0,
    released_escrows: 0,
    disputed_escrows: 0,
    total_escrows: 0,
    pending_payments: 0,
    approved_payments: 0,
    total_payments: 0,
    failed_payments: 0,
    total_users: 0,
    total_clients: 0,
    approved_clients: 0,
    pending_clients: 0,
    pending_sessions: 0,
    active_sessions: 0,
    completed_sessions: 0,
    total_sessions: 0,
    total_purchases: 0,
    purchases_24h: 0,
    bookings_24h: 0,
    payments_volume_7d: 0,
    escrow_released_7d: 0,
  });

  const formatNumber = (value) => Number(value || 0).toLocaleString();
  const formatCurrency = (value) => `₦${formatNumber(value)}`;

  const detailTitle = useMemo(() => {
    if (!selectedItem) {
      return "";
    }
    if (section === "models") {
      return selectedItem.display_name || "Model verification";
    }
    if (section === "content") {
      return selectedItem.title || "Content item";
    }
    if (section === "payments") {
      return selectedItem.transaction_ref || "Crypto payment";
    }
    if (section === "escrows" || section === "disputes") {
      return selectedItem.escrow_ref || "Escrow";
    }
    return "Queue item";
  }, [section, selectedItem]);

  const detailFields = useMemo(() => {
    if (!selectedItem) {
      return [];
    }
    if (section === "models") {
      return [
        { label: "Display name", value: selectedItem.display_name || "-" },
        { label: "Public ID", value: selectedItem.public_id || "-" },
        { label: "Status", value: selectedItem.verification_status || "-" },
        { label: "Submitted", value: selectedItem.verification_submitted_at || "-" },
        { label: "Approved at", value: selectedItem.approved_at || "-" },
        { label: "Online", value: selectedItem.is_online ? "Online" : "Offline" },
      ];
    }
    if (section === "content") {
      return [
        { label: "Title", value: selectedItem.title || "-" },
        { label: "Creator", value: selectedItem.display_name || selectedItem.public_id || "-" },
        { label: "Type", value: selectedItem.content_type || "-" },
        { label: "Unlock price", value: selectedItem.price ? `₦${selectedItem.price}` : "Teaser" },
        { label: "Status", value: selectedItem.is_active ? "Approved" : "Pending" },
        { label: "Created", value: selectedItem.created_at || "-" },
      ];
    }
    if (section === "payments") {
      return [
        { label: "Ref", value: selectedItem.transaction_ref || "-" },
        { label: "Amount", value: selectedItem.amount ? `₦${selectedItem.amount}` : "-" },
        { label: "Status", value: selectedItem.status || "-" },
        { label: "Provider", value: selectedItem.payment_provider || "-" },
        { label: "Username", value: selectedItem.username || selectedItem.public_id || "-" },
        {
          label: "Reference",
          value:
            selectedItem.metadata_json?.crypto_tx_hash ||
            selectedItem.metadata_json?.flutterwave_ref ||
            selectedItem.metadata_json?.flutterwave_tx_id ||
            "-",
        },
        {
          label: "Network",
          value:
            selectedItem.metadata_json?.crypto_network ||
            selectedItem.metadata_json?.flutterwave_currency ||
            "-",
        },
      ];
    }
    return [
      { label: "Escrow ref", value: selectedItem.escrow_ref || "-" },
      { label: "Type", value: selectedItem.escrow_type || "-" },
      { label: "Amount", value: selectedItem.amount ? `₦${selectedItem.amount}` : "-" },
      { label: "Status", value: selectedItem.status || "-" },
      {
        label: "Payer",
        value: selectedItem.payer_username || selectedItem.payer_public_id || "-",
      },
      {
        label: "Receiver",
        value: selectedItem.receiver_username || selectedItem.receiver_public_id || "-",
      },
    ];
  }, [section, selectedItem]);

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

  const loadQueue = useCallback(async () => {
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
    if (section === "payments" && paymentView === "approved") {
      endpoint = "/api/admin/payments?status=approved";
    }
    if (section === "escrows" && escrowView === "released") {
      endpoint = "/api/admin/escrows?status=released";
    }
    if (section === "disputes") {
      endpoint = "/api/admin/escrows?status=disputed";
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
    setLastRefreshAt(new Date().toISOString());
  }, [initData, section, modelView, contentView, paymentView, escrowView]);

  const loadMetrics = useCallback(async () => {
    if (!initData) {
      return;
    }
    const res = await fetch("/api/admin/metrics", {
      headers: { "x-telegram-init": initData },
    });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    if (data?.ok) {
      setMetrics((prev) => ({ ...prev, ...data }));
    }
  }, [initData]);

  useEffect(() => {
    loadQueue();
    loadMetrics();
  }, [loadQueue, loadMetrics]);

  useEffect(() => {
    if (!liveQueue) {
      return;
    }
    const interval = setInterval(() => {
      loadQueue();
      loadMetrics();
    }, 15000);
    return () => clearInterval(interval);
  }, [liveQueue, loadQueue, loadMetrics]);

  useEffect(() => {
    setSelectedItem(null);
    setPreview({ open: false, url: "", type: "video" });
  }, [section, modelView, contentView, paymentView, escrowView]);

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
    setSelectedItem(null);
    await loadQueue();
    await loadMetrics();
  };

  const exportAuditLog = () => {
    const payload = {
      section,
      view: section === "models" ? modelView : section === "content" ? contentView : "all",
      generated_at: new Date().toISOString(),
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `velvet-rooms-${section}-audit.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openPreview = (url, type = "video") => {
    if (!url) {
      return;
    }
    setPreview({ open: true, url, type });
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
            Payments
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
          <div className="metric-group">
            <h4>Operations</h4>
            <div className="metric-grid">
              <div className="metric">
                <span>Pending models</span>
                <strong>{formatNumber(metrics.pending_models)}</strong>
              </div>
              <div className="metric">
                <span>Approved models</span>
                <strong>{formatNumber(metrics.approved_models)}</strong>
              </div>
              <div className="metric">
                <span>Online models</span>
                <strong>{formatNumber(metrics.online_models)}</strong>
              </div>
              <div className="metric">
                <span>Pending content</span>
                <strong>{formatNumber(metrics.pending_content)}</strong>
              </div>
              <div className="metric">
                <span>Approved content</span>
                <strong>{formatNumber(metrics.approved_content)}</strong>
              </div>
              <div className="metric">
                <span>Pending payments</span>
                <strong>{formatNumber(metrics.pending_payments)}</strong>
              </div>
              <div className="metric">
                <span>Approved payments</span>
                <strong>{formatNumber(metrics.approved_payments)}</strong>
              </div>
              <div className="metric">
                <span>Held escrows</span>
                <strong>{formatNumber(metrics.held_escrows)}</strong>
              </div>
              <div className="metric">
                <span>Released escrows</span>
                <strong>{formatNumber(metrics.released_escrows)}</strong>
              </div>
              <div className="metric">
                <span>Disputes</span>
                <strong>{formatNumber(metrics.disputed_escrows)}</strong>
              </div>
              <div className="metric">
                <span>Approved clients</span>
                <strong>{formatNumber(metrics.approved_clients)}</strong>
              </div>
              <div className="metric">
                <span>Pending clients</span>
                <strong>{formatNumber(metrics.pending_clients)}</strong>
              </div>
            </div>
          </div>
          <div className="metric-group">
            <h4>Engagement</h4>
            <div className="metric-grid">
              <div className="metric">
                <span>Total users</span>
                <strong>{formatNumber(metrics.total_users)}</strong>
              </div>
              <div className="metric">
                <span>Total clients</span>
                <strong>{formatNumber(metrics.total_clients)}</strong>
              </div>
              <div className="metric">
                <span>Total models</span>
                <strong>{formatNumber(metrics.total_models)}</strong>
              </div>
              <div className="metric">
                <span>Total sessions</span>
                <strong>{formatNumber(metrics.total_sessions)}</strong>
              </div>
              <div className="metric">
                <span>Active sessions</span>
                <strong>{formatNumber(metrics.active_sessions)}</strong>
              </div>
              <div className="metric">
                <span>Completed sessions</span>
                <strong>{formatNumber(metrics.completed_sessions)}</strong>
              </div>
              <div className="metric">
                <span>Total purchases</span>
                <strong>{formatNumber(metrics.total_purchases)}</strong>
              </div>
              <div className="metric">
                <span>Purchases (24h)</span>
                <strong>{formatNumber(metrics.purchases_24h)}</strong>
              </div>
              <div className="metric">
                <span>Bookings (24h)</span>
                <strong>{formatNumber(metrics.bookings_24h)}</strong>
              </div>
              <div className="metric">
                <span>Payments 7d</span>
                <strong>{formatCurrency(metrics.payments_volume_7d)}</strong>
              </div>
              <div className="metric">
                <span>Escrow released 7d</span>
                <strong>{formatCurrency(metrics.escrow_released_7d)}</strong>
              </div>
            </div>
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
              ? "Approve payments before escrows are created."
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
          {section === "payments" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${paymentView === "pending" ? "primary" : "ghost"}`}
                onClick={() => setPaymentView("pending")}
              >
                Pending payments
              </button>
              <button
                type="button"
                className={`cta ${paymentView === "approved" ? "primary" : "ghost"}`}
                onClick={() => setPaymentView("approved")}
              >
                Approved payments
              </button>
            </div>
          )}
          {section === "escrows" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${escrowView === "pending" ? "primary" : "ghost"}`}
                onClick={() => setEscrowView("pending")}
              >
                Pending escrows
              </button>
              <button
                type="button"
                className={`cta ${escrowView === "released" ? "primary" : "ghost"}`}
                onClick={() => setEscrowView("released")}
              >
                Released escrows
              </button>
            </div>
          )}
          <div className="panel-actions">
            <button
              type="button"
              className={`cta ${liveQueue ? "primary" : "ghost"}`}
              onClick={() => setLiveQueue((prev) => !prev)}
            >
              {liveQueue ? "Live queue on" : "Open live queue"}
            </button>
            <button type="button" className="cta ghost" onClick={exportAuditLog}>
              Export audit log
            </button>
          </div>
          {lastRefreshAt && (
            <p className="helper">Last refresh: {new Date(lastRefreshAt).toLocaleString()}</p>
          )}
          <div className="admin-pill">Manual approvals only • 18+ content</div>
        </aside>

        <div className="admin-list">
          {preview.open && (
            <div className="admin-preview">
              <div className="admin-preview-card">
                <div className="admin-actions-bar">
                  <strong>Preview</strong>
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => setPreview({ open: false, url: "", type: "video" })}
                  >
                    Close
                  </button>
                </div>
                {preview.type === "video" ? (
                  <video src={preview.url} controls />
                ) : (
                  <img src={preview.url} alt="Preview" />
                )}
              </div>
            </div>
          )}
          {error && <div className="empty">{error}</div>}
          {!error && (
            <div className="empty subtle">Live queue updates when new submissions arrive.</div>
          )}
          {!error && !selectedItem && items.length === 0 && (
            <div className="empty">Queue is empty.</div>
          )}
          {!error && selectedItem && (
            <article className="admin-detail">
              <div className="admin-detail-header">
                <div>
                  <p className="queue-id">
                    {(section === "payments" && (selectedItem.username || selectedItem.public_id)) ||
                      selectedItem.public_id ||
                      selectedItem.escrow_ref ||
                      selectedItem.transaction_ref ||
                      selectedItem.id}
                  </p>
                  <h3>{detailTitle}</h3>
                  <p className="queue-meta">
                    {section === "models" &&
                      (modelView === "approved" ? "Verified model" : "Verification pending")}
                    {section === "content" && "Content awaiting approval"}
                    {section === "payments" &&
                      `Payment · ${selectedItem.amount} · ${
                        selectedItem.metadata_json?.crypto_tx_hash ||
                        selectedItem.metadata_json?.flutterwave_ref ||
                        "ref pending"
                      }`}
                    {(section === "escrows" || section === "disputes") &&
                      `${selectedItem.status === "held" ? "Held" : "Released"} escrow · ${selectedItem.amount}`}
                  </p>
                </div>
                <div className="queue-actions">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => setSelectedItem(null)}
                  >
                    Back to queue
                  </button>
                  {section === "models" && modelView === "pending" && (
                    <>
                      <button
                        type="button"
                        className="cta primary"
                        onClick={() =>
                          handleAction("/api/admin/models/approve", {
                            user_id: selectedItem.user_id,
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
                            user_id: selectedItem.user_id,
                          })
                        }
                      >
                        Reject
                      </button>
                      {selectedItem.verification_video_url && (
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() =>
                            openPreview(selectedItem.verification_video_url, "video")
                          }
                        >
                          Preview video
                        </button>
                      )}
                    </>
                  )}
                  {section === "content" && (
                    <>
                      {selectedItem.preview_url && (
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() =>
                            openPreview(
                              selectedItem.preview_url,
                              selectedItem.content_type === "video" ? "video" : "image"
                            )
                          }
                        >
                          Preview
                        </button>
                      )}
                      {contentView === "pending" && (
                        <>
                          <button
                            type="button"
                            className="cta primary"
                            onClick={() =>
                              handleAction("/api/admin/content/approve", {
                                content_id: selectedItem.id,
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
                                content_id: selectedItem.id,
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
                            content_id: selectedItem.id,
                          })
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {(section === "escrows" || section === "disputes") && (
                    <>
                      {(section === "disputes" || escrowView === "pending") && (
                        <>
                          <button
                            type="button"
                            className="cta primary"
                            onClick={() =>
                              handleAction("/api/admin/escrows/release", {
                                escrow_ref: selectedItem.escrow_ref,
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
                                escrow_ref: selectedItem.escrow_ref,
                              })
                            }
                          >
                            Refund
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {section === "payments" && (
                    <>
                      <div className="status-pill live">
                        {(selectedItem.payment_provider || "PAYMENT").toUpperCase()}
                      </div>
                      {paymentView === "pending" && (
                        <>
                          <button
                            type="button"
                            className="cta primary"
                            onClick={() =>
                              handleAction("/api/admin/payments/approve", {
                                transaction_ref: selectedItem.transaction_ref,
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
                                transaction_ref: selectedItem.transaction_ref,
                              })
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="admin-detail-grid">
                {detailFields.map((field) => (
                  <div key={field.label} className="admin-detail-card">
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          )}
          {!error &&
            !selectedItem &&
            items.map((item) => (
              <article
                key={item.user_id || item.id || item.escrow_ref || item.transaction_ref}
                className="queue-card"
              >
                <div>
                  <p className="queue-id">
                    {(section === "payments" && (item.username || item.public_id)) ||
                      item.public_id ||
                      item.escrow_ref ||
                      item.transaction_ref ||
                      item.id}
                  </p>
                  <h3>{item.display_name || item.title || item.escrow_type || "Payment"}</h3>
                  <p className="queue-meta">
                    {section === "models" &&
                      (modelView === "approved" ? "Verified model" : "Verification pending")}
                    {section === "content" &&
                      (contentView === "approved" ? "Approved content" : "Content awaiting approval")}
                    {section === "payments" &&
                      `${paymentView === "approved" ? "Approved" : "Payment"} · ${
                        item.amount
                      } · ${
                        item.metadata_json?.crypto_tx_hash ||
                        item.metadata_json?.flutterwave_ref ||
                        "ref pending"
                      }`}
                    {section === "escrows" &&
                      `${escrowView === "released" ? "Released" : "Held"} escrow · ${
                        item.amount
                      }`}
                  </p>
                </div>
                <div className="queue-actions">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => setSelectedItem(item)}
                  >
                    View details
                  </button>
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
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() => openPreview(item.verification_video_url, "video")}
                        >
                          Preview video
                        </button>
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
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() =>
                            openPreview(
                              item.preview_url,
                              item.content_type === "video" ? "video" : "image"
                            )
                          }
                        >
                          Preview
                        </button>
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
                      {escrowView === "pending" && (
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
                    </>
                  )}
                  {section === "disputes" && (
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
                        {(item.payment_provider || "PAYMENT").toUpperCase()}
                      </div>
                      {paymentView === "pending" && (
                        <>
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
