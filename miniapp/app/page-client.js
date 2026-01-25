"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const searchParams = useSearchParams();
  const contentId = searchParams.get("content");
  const modelId = searchParams.get("model");
  const [role, setRole] = useState(null);
  const [clientStep, setClientStep] = useState(1);
  const [modelStep, setModelStep] = useState(1);
  const [initData, setInitData] = useState("");
  const [clientForm, setClientForm] = useState({
    displayName: "",
    email: "",
    location: "",
    birthMonth: "",
    birthYear: "",
  });
  const [modelForm, setModelForm] = useState({
    stageName: "",
    bio: "",
    email: "",
    birthMonth: "",
    birthYear: "",
    videoFile: null,
    videoName: "",
  });
  const [clientStatus, setClientStatus] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [profile, setProfile] = useState(null);
  const [modelApproved, setModelApproved] = useState(false);
  const [clientAccessPaid, setClientAccessPaid] = useState(false);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryStatus, setGalleryStatus] = useState("");
  const [visibleTeasers, setVisibleTeasers] = useState({});
  const [showContentForm, setShowContentForm] = useState(false);
  const [contentStatus, setContentStatus] = useState("");
  const [modelItems, setModelItems] = useState([]);
  const [modelItemsStatus, setModelItemsStatus] = useState("");
  const [myBookings, setMyBookings] = useState([]);
  const [myBookingsStatus, setMyBookingsStatus] = useState("");
  const [showBookings, setShowBookings] = useState(false);
  const [contentForm, setContentForm] = useState({
    title: "",
    description: "",
    unlockPrice: "",
    contentType: "image",
    mediaFile: null,
    mediaName: "",
  });
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const [paymentState, setPaymentState] = useState({
    open: false,
    mode: null,
    contentId: null,
    amount: null,
    transactionRef: "",
    networks: [],
    currencies: [],
    wallets: {},
    selectedNetwork: "",
    selectedCurrency: "",
    txHash: "",
    status: "",
  });

  useEffect(() => {
    if (contentId || modelId) {
      setRole("client");
    }
  }, [contentId, modelId]);

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
    if (!initData || role !== "model") {
      return undefined;
    }
    const ping = () =>
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [initData, role]);

  useEffect(() => {
    if (!initData || role !== "client") {
      return;
    }
    const loadGallery = async () => {
      try {
        const res = await fetch("/api/content", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          if (res.status === 403) {
            setGalleryStatus("Access fee required to view the gallery.");
          } else {
            setGalleryStatus(`Gallery unavailable (HTTP ${res.status}).`);
          }
          setGalleryItems([]);
          return;
        }
        const data = await res.json();
        setGalleryItems(data.items || []);
        setGalleryStatus("");
      } catch {
        setGalleryStatus("Gallery unavailable.");
        setGalleryItems([]);
      }
    };
    loadGallery();
  }, [initData, role]);

  useEffect(() => {
    if (!initData || role !== "model" || !modelApproved) {
      return;
    }
    const loadMyContent = async () => {
      try {
        const res = await fetch("/api/content?scope=mine", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setModelItemsStatus(`Unable to load your teasers (HTTP ${res.status}).`);
          setModelItems([]);
          return;
        }
        const data = await res.json();
        setModelItems(data.items || []);
        setModelItemsStatus("");
      } catch {
        setModelItemsStatus("Unable to load your teasers.");
        setModelItems([]);
      }
    };
    loadMyContent();
  }, [initData, role, modelApproved, contentRefreshKey]);

  useEffect(() => {
    if (!initData || role !== "model" || !modelApproved || !showBookings) {
      return;
    }
    const loadBookings = async () => {
      try {
        const res = await fetch("/api/sessions?scope=mine", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setMyBookingsStatus(`Unable to load bookings (HTTP ${res.status}).`);
          setMyBookings([]);
          return;
        }
        const data = await res.json();
        setMyBookings(data.items || []);
        setMyBookingsStatus("");
      } catch {
        setMyBookingsStatus("Unable to load bookings.");
        setMyBookings([]);
      }
    };
    loadBookings();
  }, [initData, role, modelApproved, showBookings]);

  useEffect(() => {
    if (!initData) {
      return;
    }
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/me", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!data?.user) {
          return;
        }
        setProfile(data);
        if (data.user.role === "model") {
          setRole("model");
          if (data.model?.verification_status === "approved") {
            setModelApproved(true);
            setModelStatus("Verified ✅ Your dashboard is unlocked.");
            setModelStep(4);
          } else if (data.model?.verification_status) {
            setModelApproved(false);
            setModelStatus("Verification in review. You'll be notified when approved.");
            setModelStep(3);
          }
          if (data.model?.display_name) {
            setModelForm((prev) => ({ ...prev, stageName: data.model.display_name }));
          }
        } else if (data.user.role === "client") {
          setRole("client");
          if (data.client?.access_fee_paid) {
            setClientStep(3);
          } else {
            setClientStep(2);
          }
        }
        if (data.client?.access_fee_paid) {
          setClientAccessPaid(true);
        } else if (data.client) {
          setClientAccessPaid(false);
        }
      } catch {
        // ignore load errors
      }
    };
    loadProfile();
  }, [initData]);

  const refreshClientAccess = async () => {
    if (!initData) {
      return;
    }
    try {
      const res = await fetch("/api/me", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        setClientStatus("Unable to refresh access status.");
        return;
      }
      const data = await res.json();
      if (data.client?.access_fee_paid) {
        setClientAccessPaid(true);
        setClientStatus("");
        setClientStep(3);
      } else {
        setClientStatus("Access fee still pending admin approval.");
      }
    } catch {
      setClientStatus("Unable to refresh access status.");
    }
  };

  const handleRole = (nextRole) => {
    setRole(nextRole);
    const target = document.getElementById(`${nextRole}-flow`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const startCryptoPayment = async ({ mode, contentId = null }) => {
    if (!initData) {
      setPaymentState((prev) => ({
        ...prev,
        open: true,
        status: "Open this mini app inside Telegram to proceed.",
      }));
      return;
    }
    const payload = {
      initData,
      escrow_type: mode === "access" ? "access_fee" : "content",
      content_id: contentId,
    };
    try {
      const res = await fetch("/api/payments/crypto/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPaymentState((prev) => ({
          ...prev,
          open: true,
          status: data?.error
            ? `Payment init failed: ${data.error}`
            : `Payment init failed (HTTP ${res.status}).`,
        }));
        return;
      }
      const data = await res.json();
      const networks = data.networks || [];
      const currencies = data.currencies || [];
      setPaymentState({
        open: true,
        mode,
        contentId,
        amount: data.amount,
        transactionRef: data.transaction_ref,
        networks,
        currencies,
        wallets: data.wallets || {},
        selectedNetwork: networks[0] || "",
        selectedCurrency: currencies[0] || "",
        txHash: "",
        status: "Send payment and submit the transaction hash.",
      });
    } catch {
      setPaymentState((prev) => ({
        ...prev,
        open: true,
        status: "Payment init failed. Try again.",
      }));
    }
  };

  const submitCryptoPayment = async () => {
    if (!paymentState.transactionRef) {
      setPaymentState((prev) => ({ ...prev, status: "Missing transaction reference." }));
      return;
    }
    if (!paymentState.txHash || !paymentState.selectedNetwork || !paymentState.selectedCurrency) {
      setPaymentState((prev) => ({ ...prev, status: "Provide network, currency, and hash." }));
      return;
    }
    try {
      const res = await fetch("/api/payments/crypto/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          transaction_ref: paymentState.transactionRef,
          tx_hash: paymentState.txHash,
          network: paymentState.selectedNetwork,
          currency: paymentState.selectedCurrency,
        }),
      });
      if (!res.ok) {
        setPaymentState((prev) => ({
          ...prev,
          status: `Submission failed (HTTP ${res.status}).`,
        }));
        return;
      }
      setPaymentState((prev) => ({
        ...prev,
        status: "Payment submitted ✅ Await admin approval.",
      }));
    } catch {
      setPaymentState((prev) => ({ ...prev, status: "Submission failed. Try again." }));
    }
  };

  const handleClientNext = async () => {
    if (clientStep === 1 && !clientForm.email) {
      setClientStatus("Add your email to continue.");
      return;
    }
    if (clientStep === 1) {
      const ageCheck = isAdult(clientForm.birthYear, clientForm.birthMonth);
      if (!ageCheck.ok) {
        setClientStatus(ageCheck.message);
        return;
      }
      if (!initData) {
        setClientStatus("Open this mini app inside Telegram to continue.");
        return;
      }
      try {
        const res = await fetch("/api/client/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData,
            display_name: clientForm.displayName,
            email: clientForm.email,
            location: clientForm.location,
            birth_month: clientForm.birthMonth,
            birth_year: clientForm.birthYear,
          }),
        });
        if (!res.ok) {
          setClientStatus("Registration failed. Please check your details.");
          return;
        }
      } catch {
        setClientStatus("Registration failed. Please try again.");
        return;
      }
    }
    setClientStatus("");
    setClientStep((prev) => Math.min(prev + 1, 2));
  };

  const handleModelNext = () => {
    if (modelStep === 1 && !modelForm.stageName) {
      setModelStatus("Add a stage name to continue.");
      return;
    }
    if (modelStep === 1) {
      const ageCheck = isAdult(modelForm.birthYear, modelForm.birthMonth);
      if (!ageCheck.ok) {
        setModelStatus(ageCheck.message);
        return;
      }
    }
    if (modelStep === 2 && !modelForm.videoName) {
      setModelStatus("Upload a short verification video to continue.");
      return;
    }
    setModelStatus("");
    setModelStep((prev) => Math.min(prev + 1, 3));
  };

  const submitModelVerification = async () => {
    const tgInit =
      window?.Telegram?.WebApp?.initData ||
      initData ||
      new URLSearchParams(window.location.search).get("tgWebAppData") ||
      new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tgWebAppData") ||
      "";
    if (!tgInit) {
      setModelStatus("Open this mini app inside Telegram to submit verification.");
      return;
    }
    if (!modelForm.stageName || !modelForm.email || !modelForm.videoFile) {
      setModelStatus("Stage name, email, and verification video are required.");
      return;
    }
    const ageCheck = isAdult(modelForm.birthYear, modelForm.birthMonth);
    if (!ageCheck.ok) {
      setModelStatus(ageCheck.message);
      return;
    }
    try {
      const uploadInit = await fetch("/api/verification/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: tgInit,
          filename: modelForm.videoFile.name,
        }),
      });
      if (!uploadInit.ok) {
        setModelStatus("Unable to start upload. Try again.");
        return;
      }
      const uploadPayload = await uploadInit.json();
      if (!uploadPayload?.signed_url || !uploadPayload?.path) {
        setModelStatus("Upload link missing. Try again.");
        return;
      }
      const uploadRes = await fetch(uploadPayload.signed_url, {
        method: "PUT",
        headers: {
          "Content-Type": modelForm.videoFile.type || "video/mp4",
          "x-upsert": "true",
        },
        body: modelForm.videoFile,
      });
      if (!uploadRes.ok) {
        setModelStatus(`Upload failed (HTTP ${uploadRes.status}).`);
        return;
      }
      const res = await fetch("/api/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: tgInit,
          display_name: modelForm.stageName,
          email: modelForm.email,
          birth_month: modelForm.birthMonth,
          birth_year: modelForm.birthYear,
          video_path: uploadPayload.path,
        }),
      });
      if (!res.ok) {
        let detail = `Submission failed (HTTP ${res.status}).`;
        try {
          const payload = await res.json();
          if (payload?.detail) {
            detail = `${detail} ${payload.detail}`;
          } else if (payload?.error) {
            detail = `${detail} ${payload.error}`;
          }
        } catch {
          // ignore parse error
        }
        setModelStatus(detail);
        return;
      }
    } catch (err) {
      setModelStatus("Submission failed (network error).");
      return;
    }
    setModelStatus("Verification submitted. Await admin approval.");
    setModelStep(3);
  };

  const submitContent = async () => {
    if (!initData) {
      setContentStatus("Open this mini app inside Telegram to add content.");
      return;
    }
    if (!contentForm.title || !contentForm.mediaFile) {
      setContentStatus("Add a title and teaser media.");
      return;
    }
    const formData = new FormData();
    formData.append("initData", initData);
    formData.append("title", contentForm.title);
    formData.append("description", contentForm.description);
    if (contentForm.unlockPrice) {
      formData.append("price", contentForm.unlockPrice);
    }
    formData.append("content_type", contentForm.contentType);
    formData.append("media", contentForm.mediaFile);
    try {
      const res = await fetch("/api/content", { method: "POST", body: formData });
      if (!res.ok) {
        setContentStatus(`Content submission failed (HTTP ${res.status}).`);
        return;
      }
    } catch {
      setContentStatus("Content submission failed.");
      return;
    }
    setContentStatus("Teaser submitted for admin approval.");
    setShowContentForm(false);
    setContentRefreshKey((prev) => prev + 1);
    setContentForm({
      title: "",
      description: "",
      unlockPrice: "",
      contentType: "image",
      mediaFile: null,
      mediaName: "",
    });
  };

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <span className="brand-dot" />
          Velvet Rooms
        </div>
        <div className="top-actions">
          <button className={`ghost ${role === "client" ? "active" : ""}`} onClick={() => handleRole("client")}>
            Client
          </button>
          <button className={`ghost ${role === "model" ? "active" : ""}`} onClick={() => handleRole("model")}>
            Model
          </button>
        </div>
      </header>

      {!role && contentId && (
        <section className="banner">
          <strong>Content selected:</strong> #{contentId} — continue to purchase.
        </section>
      )}
      {!role && modelId && (
        <section className="banner">
          <strong>Model selected:</strong> {modelId} — continue to book a session.
        </section>
      )}

      {!role && (
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Private Creator Marketplace</p>
          <h1>Premium content. Private sessions. Escrow‑protected.</h1>
          <p className="lead">
            Velvet Rooms is a verified, members‑only platform for premium content and live sessions.
            Every payment is held in escrow, every creator is approved, every action logged.
          </p>
          <div className="cta-row">
          <button type="button" className="cta primary" onClick={() => handleRole("client")}>
            Continue as Client
          </button>
          <button type="button" className="cta primary alt" onClick={() => handleRole("model")}>
            Continue as Model
          </button>
          </div>
          <div className="status">
            <span className="dot" />
            18+ only. Consent‑first. Private by design.
          </div>
          <div className="status">
            <span className="dot" />
            Escrow holds funds until admin release.
          </div>
        </div>
        <div className="hero-card">
          <div className="card-head">
            <div>
              <p className="card-label">Verified Only</p>
              <h3>Creator Content Hub</h3>
            </div>
            <span className="pill">18+</span>
          </div>
          <div className="card-body">
            <div className="line">
              <span>Creators</span>
              <strong>Approved before listing</strong>
            </div>
            <div className="line">
              <span>Payments</span>
              <strong>Escrow, manual release</strong>
            </div>
            <div className="line">
              <span>Privacy</span>
              <strong>Discrete, protected, logged</strong>
            </div>
          </div>
        </div>
      </section>
      )}

      {!role && (
      <section className="role-grid">
        <article className={`role-card ${role === "client" ? "selected" : ""}`}>
          <h3>Client Flow</h3>
          <ol>
            <li>Register → pay access fee (escrow)</li>
            <li>Browse gallery teasers</li>
            <li>Book sessions or buy content</li>
            <li>Confirm completion to release</li>
          </ol>
          <button type="button" className="cta ghost" onClick={() => handleRole("client")}>
            Start as Client
          </button>
        </article>
        <article className={`role-card ${role === "model" ? "selected" : ""}`}>
          <h3>Model Flow</h3>
          <ol>
            <li>Register → submit video verification</li>
            <li>Admin approval → verified dashboard</li>
            <li>Add content → gallery teasers</li>
            <li>Run sessions → confirm release</li>
          </ol>
          <button type="button" className="cta ghost" onClick={() => handleRole("model")}>
            Start as Model
          </button>
        </article>
      </section>
      )}

      {role === "client" && (
      <section className="flow-grid">
        <article className="flow-panel" id="client-flow">
          <header className="flow-head">
            <div>
              <p className="eyebrow">Client Onboarding</p>
              <h2>Unlock the content gallery.</h2>
            </div>
            <div className="stepper">
              <span className={clientStep >= 1 ? "step active" : "step"}>1</span>
              <span className={clientStep >= 2 ? "step active" : "step"}>2</span>
              <span className={clientStep >= 3 ? "step active" : "step"}>3</span>
            </div>
          </header>
          <div className="flow-body">
            {clientStep === 1 && (
              <div className="flow-card">
                <h3>Profile Details</h3>
                <label className="field">
                  Display name
                  <input
                    type="text"
                    value={clientForm.displayName}
                    onChange={(event) =>
                      setClientForm((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    placeholder="VelvetClient"
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(event) =>
                      setClientForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="you@email.com"
                  />
                </label>
                <label className="field">
                  Location
                  <input
                    type="text"
                    value={clientForm.location}
                    onChange={(event) =>
                      setClientForm((prev) => ({ ...prev, location: event.target.value }))
                    }
                    placeholder="Lagos, NG"
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    Birth month
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={clientForm.birthMonth}
                      onChange={(event) =>
                        setClientForm((prev) => ({ ...prev, birthMonth: event.target.value }))
                      }
                      placeholder="MM"
                    />
                  </label>
                  <label className="field">
                    Birth year
                    <input
                      type="number"
                      min="1900"
                      max="2100"
                      value={clientForm.birthYear}
                      onChange={(event) =>
                        setClientForm((prev) => ({ ...prev, birthYear: event.target.value }))
                      }
                      placeholder="YYYY"
                    />
                  </label>
                </div>
                <p className="helper">18+ only. Your birth date stays private.</p>
              </div>
            )}
            {clientStep === 2 && (
              <div className="flow-card">
                <h3>Access Fee (Escrow)</h3>
                <p>
                  Pay once to unlock verified creator content. Funds stay in escrow until admin approval.
                </p>
                <div className="price-tag">
                  ₦5,000 <span>Escrow Held</span>
                </div>
                <button
                  type="button"
                  className="cta primary"
                  onClick={() => startCryptoPayment({ mode: "access" })}
                >
                  Show payment options
                </button>
                <button type="button" className="cta ghost" onClick={refreshClientAccess}>
                  I already paid
                </button>
                {paymentState.status && paymentState.mode === "access" && (
                  <p className="helper">{paymentState.status}</p>
                )}
              </div>
            )}
            {clientStep === 3 && (
              <div className="flow-card">
                <h3>You are ready</h3>
                <p>Browse verified creators, buy content, or book a session.</p>
                <button type="button" className="cta primary">
                  Open Gallery
                </button>
                {galleryStatus && <p className="helper error">{galleryStatus}</p>}
                {galleryStatus && galleryStatus.includes("Access fee") && (
                  <button
                    type="button"
                    className="cta primary alt"
                    onClick={() => startCryptoPayment({ mode: "access" })}
                  >
                    Pay access fee
                  </button>
                )}
                {!galleryStatus && galleryItems.length === 0 && (
                  <p className="helper">No approved teasers yet.</p>
                )}
                {!galleryStatus && galleryItems.length > 0 && (
                  <div className="gallery-grid">
                    {galleryItems.map((item) => (
                      <div key={`gallery-${item.id}`} className="gallery-card">
                        <div className="gallery-media">
                          {visibleTeasers[item.id] && item.preview_url ? (
                            item.content_type === "video" ? (
                              <video src={item.preview_url} muted playsInline />
                            ) : (
                              <img src={item.preview_url} alt={item.title} />
                            )
                          ) : (
                            <div className="media-fallback">Tap to view</div>
                          )}
                        </div>
                        <div className="gallery-body">
                          <h4>{item.title}</h4>
                          <p>{item.description || "Teaser content"}</p>
                          <div className="gallery-meta">
                            <span>{item.display_name || item.public_id}</span>
                            <strong>{item.price ? `Unlock ₦${item.price}` : "Teaser"}</strong>
                          </div>
                          <button
                            type="button"
                            className="cta ghost"
                            onClick={() => {
                              setVisibleTeasers((prev) => ({ ...prev, [item.id]: true }));
                              setTimeout(() => {
                                setVisibleTeasers((prev) => ({
                                  ...prev,
                                  [item.id]: false,
                                }));
                              }, 60000);
                            }}
                          >
                            View teaser
                          </button>
                          <button
                            type="button"
                            className="cta ghost"
                            onClick={() =>
                              startCryptoPayment({ mode: "content", contentId: item.id })
                            }
                            disabled={!item.price || Number(item.price) <= 0}
                          >
                            Unlock full content
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {clientStatus && <p className="helper error">{clientStatus}</p>}
          {clientStep === 1 && (
            <button type="button" className="cta primary" onClick={handleClientNext}>
              Continue
            </button>
          )}
        </article>
      </section>
      )}

      {paymentState.open && (
        <section className="payment-sheet">
          <div className="payment-card">
            <header>
              <h3>Crypto payment</h3>
              <button
                type="button"
                className="cta ghost"
                onClick={() =>
                  setPaymentState((prev) => ({ ...prev, open: false, status: "" }))
                }
              >
                Close
              </button>
            </header>
            <p className="helper">
              Send {paymentState.amount ? `₦${paymentState.amount}` : "the amount"} using the
              wallet below, then paste the transaction hash.
            </p>
            <div className="field-row">
              <label className="field">
                Network
                <select
                  value={paymentState.selectedNetwork}
                  onChange={(event) =>
                    setPaymentState((prev) => ({
                      ...prev,
                      selectedNetwork: event.target.value,
                    }))
                  }
                >
                  {paymentState.networks.map((network) => (
                    <option key={`net-${network}`} value={network}>
                      {network}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Currency
                <select
                  value={paymentState.selectedCurrency}
                  onChange={(event) =>
                    setPaymentState((prev) => ({
                      ...prev,
                      selectedCurrency: event.target.value,
                    }))
                  }
                >
                  {paymentState.currencies.map((currency) => (
                    <option key={`cur-${currency}`} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wallet-box">
              <span>Send to</span>
              <strong>
                {paymentState.wallets[paymentState.selectedNetwork] || "Wallet not configured"}
              </strong>
            </div>
            <label className="field">
              Transaction hash
              <input
                type="text"
                value={paymentState.txHash}
                onChange={(event) =>
                  setPaymentState((prev) => ({ ...prev, txHash: event.target.value }))
                }
                placeholder="Paste hash"
              />
            </label>
            {paymentState.status && <p className="helper">{paymentState.status}</p>}
            <button type="button" className="cta primary" onClick={submitCryptoPayment}>
              Submit payment
            </button>
          </div>
        </section>
      )}

      {role === "model" && (
      <section className="flow-grid">
        <article className="flow-panel" id="model-flow">
          <header className="flow-head">
            <div>
              <p className="eyebrow">Model Onboarding</p>
              <h2>Get verified to sell content and sessions.</h2>
            </div>
            <div className="stepper">
              <span className={modelStep >= 1 ? "step active" : "step"}>1</span>
              <span className={modelStep >= 2 ? "step active" : "step"}>2</span>
              <span className={modelStep >= 3 ? "step active" : "step"}>3</span>
            </div>
          </header>
          <div className="flow-body">
            {modelStep === 1 && (
              <div className="flow-card">
                <h3>Profile Setup</h3>
                <label className="field">
                  Stage name
                  <input
                    type="text"
                    value={modelForm.stageName}
                    onChange={(event) =>
                      setModelForm((prev) => ({ ...prev, stageName: event.target.value }))
                    }
                    placeholder="Jesse Belle"
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    type="email"
                    value={modelForm.email}
                    onChange={(event) =>
                      setModelForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="you@email.com"
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    Birth month
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={modelForm.birthMonth}
                      onChange={(event) =>
                        setModelForm((prev) => ({ ...prev, birthMonth: event.target.value }))
                      }
                      placeholder="MM"
                    />
                  </label>
                  <label className="field">
                    Birth year
                    <input
                      type="number"
                      min="1900"
                      max="2100"
                      value={modelForm.birthYear}
                      onChange={(event) =>
                        setModelForm((prev) => ({ ...prev, birthYear: event.target.value }))
                      }
                      placeholder="YYYY"
                    />
                  </label>
                </div>
                <p className="helper">18+ only. We verify eligibility and keep this private.</p>
                <label className="field">
                  Short bio
                  <textarea
                    rows="3"
                    value={modelForm.bio}
                    onChange={(event) =>
                      setModelForm((prev) => ({ ...prev, bio: event.target.value }))
                    }
                    placeholder="Describe your vibe, services, and boundaries."
                  />
                </label>
              </div>
            )}
            {modelStep === 2 && (
              <div className="flow-card">
                <h3>Verification Media</h3>
                <p>Upload a short verification video for admin review.</p>
                <label className="field file">
                  Verification video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) =>
                      setModelForm((prev) => ({
                        ...prev,
                        videoName: event.target.files?.[0]?.name || "",
                        videoFile: event.target.files?.[0] || null,
                      }))
                    }
                  />
                  <span className="file-name">{modelForm.videoName || "No file selected"}</span>
                </label>
              </div>
            )}
            {modelStep === 3 && (
              <div className="flow-card">
                <h3>Awaiting Approval</h3>
                <p>Your verification is in review. You will be notified once approved.</p>
                <button type="button" className="cta ghost" disabled>
                  Dashboard unlocks after approval
                </button>
              </div>
            )}
            {modelStep >= 4 && (
              <div className="flow-card">
                <h3>Welcome, {modelForm.stageName || "Model"}</h3>
                <p>Your verified dashboard is ready. Upload content and manage sessions.</p>
                <div className="dash-actions">
                  <button
                    type="button"
                    className="cta primary alt"
                    onClick={() => setShowContentForm((prev) => !prev)}
                  >
                    {showContentForm ? "Hide content form" : "Add content"}
                  </button>
                </div>
                <div className="dash-actions">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => setShowBookings((prev) => !prev)}
                  >
                    {showBookings ? "Hide bookings" : "View bookings"}
                  </button>
                </div>
                {showContentForm && (
                  <div className="content-form">
                    <label className="field">
                      Title
                      <input
                        type="text"
                        value={contentForm.title}
                        onChange={(event) =>
                          setContentForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder="Teaser title"
                      />
                    </label>
                    <label className="field">
                      Description
                      <textarea
                        rows="3"
                        value={contentForm.description}
                        onChange={(event) =>
                          setContentForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        placeholder="Short teaser description"
                      />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        Content type
                        <select
                          value={contentForm.contentType}
                          onChange={(event) =>
                            setContentForm((prev) => ({ ...prev, contentType: event.target.value }))
                          }
                        >
                          <option value="image">Photo</option>
                          <option value="video">Video</option>
                        </select>
                      </label>
                      <label className="field">
                        Unlock price (optional)
                        <input
                          type="number"
                          min="0"
                          value={contentForm.unlockPrice}
                          onChange={(event) =>
                            setContentForm((prev) => ({ ...prev, unlockPrice: event.target.value }))
                          }
                          placeholder="₦ 0"
                        />
                      </label>
                    </div>
                    <label className="field file">
                      Teaser media
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(event) =>
                          setContentForm((prev) => ({
                            ...prev,
                            mediaName: event.target.files?.[0]?.name || "",
                            mediaFile: event.target.files?.[0] || null,
                          }))
                        }
                      />
                      <span className="file-name">
                        {contentForm.mediaName || "No file selected"}
                      </span>
                    </label>
                    {contentStatus && <p className="helper error">{contentStatus}</p>}
                    <button type="button" className="cta primary alt" onClick={submitContent}>
                      Submit teaser
                    </button>
                  </div>
                )}
                <div className="content-list">
                  <h4>Your teasers</h4>
                  {modelItemsStatus && <p className="helper error">{modelItemsStatus}</p>}
                  {!modelItemsStatus && modelItems.length === 0 && (
                    <p className="helper">No teasers yet.</p>
                  )}
                  {!modelItemsStatus && modelItems.length > 0 && (
                    <div className="gallery-grid">
                      {modelItems.map((item) => (
                        <div key={`mine-${item.id}`} className="gallery-card">
                          <div className="gallery-media">
                            {item.preview_url ? (
                              item.content_type === "video" ? (
                                <video src={item.preview_url} muted playsInline />
                              ) : (
                                <img src={item.preview_url} alt={item.title} />
                              )
                            ) : (
                              <div className="media-fallback">Preview pending</div>
                            )}
                          </div>
                          <div className="gallery-body">
                            <h4>{item.title}</h4>
                            <p>{item.description || "Teaser content"}</p>
                            <div className="gallery-meta">
                              <span>{item.is_active ? "Approved" : "Pending approval"}</span>
                              <strong>{item.content_type}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {showBookings && (
                  <div className="content-list">
                    <h4>My bookings</h4>
                    {myBookingsStatus && <p className="helper error">{myBookingsStatus}</p>}
                    {!myBookingsStatus && myBookings.length === 0 && (
                      <p className="helper">No bookings yet.</p>
                    )}
                    {!myBookingsStatus && myBookings.length > 0 && (
                      <div className="gallery-grid">
                        {myBookings.map((item) => (
                          <div key={`booking-${item.id}`} className="gallery-card">
                            <div className="gallery-body">
                              <h4>{item.session_type || "Session"}</h4>
                              <p>{item.status || "pending"}</p>
                              <div className="gallery-meta">
                                <span>{item.client_label || "Client"}</span>
                                <strong>{item.duration_minutes || "-"} mins</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {modelStatus && (
            <p className={`helper ${modelApproved ? "success" : "error"}`}>{modelStatus}</p>
          )}
          {modelStep === 1 && (
            <button type="button" className="cta primary alt" onClick={handleModelNext}>
              Continue
            </button>
          )}
          {modelStep === 2 && (
            <button type="button" className="cta primary alt" onClick={submitModelVerification}>
              Submit verification
            </button>
          )}
        </article>
      </section>
      )}

      {!role && (
      <section className="grid">
        <article className="grid-card">
          <h4>Verified Only</h4>
          <p>Admin review for every model and content drop.</p>
        </article>
        <article className="grid-card">
          <h4>Escrow First</h4>
          <p>No instant payments. Every transaction is held.</p>
        </article>
        <article className="grid-card">
          <h4>Dispute Shield</h4>
          <p>Dispute tools with audit trails for resolution.</p>
        </article>
      </section>
      )}
    </main>
  );
}

function isAdult(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    return { ok: false, message: "Enter your birth month and year (18+ only)." };
  }
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), 1);
  const dob = new Date(y, m - 1, 1);
  if (dob > cutoff) {
    return { ok: false, message: "You must be 18+ to use Velvet Rooms." };
  }
  return { ok: true };
}
