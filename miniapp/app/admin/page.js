"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorState,
  NotificationPriorityBadge,
  SyncIndicator,
} from "../_components/ui-kit";

export default function Admin() {
  const [section, setSection] = useState("models");
  const [modelView, setModelView] = useState("pending");
  const [contentView, setContentView] = useState("pending");
  const [paymentView, setPaymentView] = useState("pending");
  const [paymentProvider, setPaymentProvider] = useState("all");
  const [paymentRange, setPaymentRange] = useState("all");
  const [escrowView, setEscrowView] = useState("pending");
  const [escrowRange, setEscrowRange] = useState("all");
  const [clientView, setClientView] = useState("pending");
  const [userQuery, setUserQuery] = useState("");
  const [userRole, setUserRole] = useState("all");
  const [userStatus, setUserStatus] = useState("all");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [initData, setInitData] = useState("");
  const [liveQueue, setLiveQueue] = useState(false);
  const [liveCountdown, setLiveCountdown] = useState(15);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [preview, setPreview] = useState({ open: false, url: "", type: "video" });
  const [pageHidden, setPageHidden] = useState(false);
  const [queueTriage, setQueueTriage] = useState("all");
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [savedFilters, setSavedFilters] = useState([]);
  const [syncTicker, setSyncTicker] = useState(0);
  const [pendingHighlight, setPendingHighlight] = useState(null);
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
    approvals_today: 0,
    median_review_seconds: 0,
    disputes_24h: 0,
    failed_payments_24h: 0,
    escrow_inflow_7d: [],
    approvals_7d: [],
  });
  const [health, setHealth] = useState({
    total_sessions_7d: 0,
    failed_sessions_7d: 0,
    session_failure_rate_7d: 0,
    disputes_7d: 0,
    call_setup_failures_24h: 0,
    call_setup_failure_rate_24h: 0,
    turn_token_errors_24h: 0,
  });
  const [notifications, setNotifications] = useState({
    open: false,
    items: [],
    unread: 0,
    loading: false,
    error: "",
  });

  const formatNumber = (value) => Number(value || 0).toLocaleString();
  const formatCurrency = (value) => `₦${formatNumber(value)}`;
  const formatPresence = (isOnline, lastSeenAt) => {
    if (isOnline) {
      return "Online";
    }
    if (!lastSeenAt) {
      return "Offline";
    }
    const seenMs = new Date(lastSeenAt).getTime();
    if (Number.isNaN(seenMs)) {
      return "Offline";
    }
    const diffSec = Math.max(0, Math.floor((Date.now() - seenMs) / 1000));
    if (diffSec < 60) {
      return "Seen just now";
    }
    if (diffSec < 3600) {
      return `Seen ${Math.floor(diffSec / 60)}m ago`;
    }
    if (diffSec < 86400) {
      return `Seen ${Math.floor(diffSec / 3600)}h ago`;
    }
    return `Seen ${Math.floor(diffSec / 86400)}d ago`;
  };
  const resolveName = (item, fallback = "User") =>
    item?.display_name || item?.username || item?.public_id || fallback;
  const revenueSeries = metrics.escrow_inflow_7d || [];
  const approvalsSeries = metrics.approvals_7d || [];
  const maxRevenue = Math.max(
    1,
    ...revenueSeries.map((entry) => Number(entry.amount || 0))
  );
  const maxApprovals = Math.max(
    1,
    ...approvalsSeries.map((entry) => Number(entry.count || 0))
  );
  const livePaused = Boolean(selectedItem) || preview.open || pageHidden;

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
    if (section === "users") {
      return resolveName(selectedItem, "User");
    }
    if (section === "clients") {
      return selectedItem.display_name || selectedItem.username || selectedItem.public_id || "Client";
    }
    if (section === "activity") {
      return selectedItem.action_type || "Activity";
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
        {
          label: "Online",
          value: formatPresence(selectedItem.is_online, selectedItem.last_seen_at),
        },
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
        { label: "Username", value: resolveName(selectedItem, "-") },
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
    if (section === "users") {
      return [
        { label: "Public ID", value: selectedItem.public_id || "-" },
        { label: "Username", value: resolveName(selectedItem, "-") },
        { label: "Role", value: selectedItem.role || "-" },
        { label: "Status", value: selectedItem.status || "-" },
        { label: "Email", value: selectedItem.email || "-" },
        { label: "Followers", value: selectedItem.followers || 0 },
        { label: "Following", value: selectedItem.following || 0 },
        { label: "Risk score", value: selectedItem.risk_score ?? 0 },
        {
          label: "Risk flags",
          value:
            Array.isArray(selectedItem.risk_flags) && selectedItem.risk_flags.length
              ? selectedItem.risk_flags.join(", ")
              : "-",
        },
        { label: "Joined", value: selectedItem.created_at || "-" },
      ];
    }
    if (section === "clients") {
      return [
        { label: "Display name", value: selectedItem.display_name || "-" },
        { label: "Username", value: selectedItem.display_name || selectedItem.username || "-" },
        { label: "Public ID", value: selectedItem.public_id || "-" },
        { label: "Email", value: selectedItem.email || "-" },
        { label: "Location", value: selectedItem.location || "-" },
        {
          label: "Birth month/year",
          value:
            selectedItem.birth_month && selectedItem.birth_year
              ? `${selectedItem.birth_month}/${selectedItem.birth_year}`
              : "-",
        },
        {
          label: "Access status",
          value: selectedItem.access_fee_paid ? "Unlocked" : "Pending",
        },
        { label: "Access granted", value: selectedItem.access_granted_at || "-" },
        { label: "Joined", value: selectedItem.created_at || "-" },
      ];
    }
    if (section === "activity") {
      return [
        { label: "Action", value: selectedItem.action_type || "-" },
        { label: "Actor", value: selectedItem.actor_display_name || selectedItem.actor_public_id || "-" },
        { label: "Target", value: selectedItem.target_display_name || selectedItem.target_public_id || "-" },
        { label: "Details", value: selectedItem.details ? JSON.stringify(selectedItem.details) : "-" },
        { label: "Created", value: selectedItem.created_at || "-" },
      ];
    }
    return [
      { label: "Escrow ref", value: selectedItem.escrow_ref || "-" },
      { label: "Type", value: selectedItem.escrow_type || "-" },
      { label: "Amount", value: selectedItem.amount ? `₦${selectedItem.amount}` : "-" },
      { label: "Status", value: selectedItem.status || "-" },
      {
        label: "Payer",
        value: selectedItem.payer_display_name || selectedItem.payer_public_id || "-",
      },
      {
        label: "Receiver",
        value: selectedItem.receiver_display_name || selectedItem.receiver_public_id || "-",
      },
    ];
  }, [section, selectedItem]);

  const getItemKey = (item) =>
    item?.user_id || item?.id || item?.escrow_ref || item?.transaction_ref || null;

  const getItemTimestamp = (item) => {
    const candidates = [
      item?.created_at,
      item?.verification_submitted_at,
      item?.submitted_at,
      item?.updated_at,
      item?.access_granted_at,
    ];
    for (const value of candidates) {
      if (!value) continue;
      const ms = new Date(value).getTime();
      if (!Number.isNaN(ms)) {
        return ms;
      }
    }
    return 0;
  };

  const filteredItems = useMemo(() => {
    if (queueTriage === "all") {
      return items;
    }
    const now = Date.now();
    if (queueTriage === "aging") {
      return (items || []).filter((item) => {
        const ts = getItemTimestamp(item);
        return ts && now - ts > 24 * 60 * 60 * 1000;
      });
    }
    if (queueTriage === "urgent") {
      return (items || []).filter((item) => {
        if (section === "disputes") {
          return true;
        }
        if (section === "payments") {
          return Number(item.amount || 0) >= 10000 || item.status === "pending";
        }
        if (section === "escrows") {
          return item.status === "held";
        }
        if (section === "clients") {
          return !item.access_fee_paid;
        }
        if (section === "models") {
          return item.verification_status !== "approved";
        }
        return false;
      });
    }
    if (queueTriage === "high_risk") {
      return (items || []).filter((item) => {
        if (Number(item.risk_score || 0) >= 70) {
          return true;
        }
        const details = JSON.stringify(item?.details || {}).toLowerCase();
        return (
          details.includes("dispute") ||
          details.includes("refund") ||
          details.includes("report") ||
          details.includes("fraud")
        );
      });
    }
    return items;
  }, [items, queueTriage, section]);

  const saveCurrentFilter = () => {
    if (typeof window === "undefined") {
      return;
    }
    const entry = {
      id: `filter-${Date.now()}`,
      label: `${section} · ${new Date().toLocaleTimeString()}`,
      value: {
        section,
        modelView,
        contentView,
        paymentView,
        paymentProvider,
        paymentRange,
        escrowView,
        escrowRange,
        clientView,
        userRole,
        userStatus,
        queueTriage,
      },
    };
    const next = [entry, ...savedFilters].slice(0, 8);
    setSavedFilters(next);
    window.localStorage.setItem("vr_admin_saved_filters", JSON.stringify(next));
  };

  const applySavedFilter = (id) => {
    const entry = savedFilters.find((item) => item.id === id);
    const value = entry?.value;
    if (!value) {
      return;
    }
    setSection(value.section || "models");
    setModelView(value.modelView || "pending");
    setContentView(value.contentView || "pending");
    setPaymentView(value.paymentView || "pending");
    setPaymentProvider(value.paymentProvider || "all");
    setPaymentRange(value.paymentRange || "all");
    setEscrowView(value.escrowView || "pending");
    setEscrowRange(value.escrowRange || "all");
    setClientView(value.clientView || "pending");
    setUserRole(value.userRole || "all");
    setUserStatus(value.userStatus || "all");
    setQueueTriage(value.queueTriage || "all");
  };

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
    if (typeof document === "undefined") {
      return;
    }
    const handler = () => {
      setPageHidden(document.hidden);
    };
    handler();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSyncTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem("vr_admin_saved_filters") || "[]");
      if (Array.isArray(parsed)) {
        setSavedFilters(parsed);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const loadQueue = useCallback(async () => {
    if (!initData) {
      setError("Open the admin console inside Telegram.");
      return;
    }
    setError("");
    if (section === "health") {
      setItems([]);
      setLastRefreshAt(new Date().toISOString());
      return;
    }
    let endpoint = "/api/admin/models";
    if (section === "content") endpoint = "/api/admin/content";
    if (section === "escrows") endpoint = "/api/admin/escrows";
    if (section === "payments") endpoint = "/api/admin/payments";
    if (section === "disputes") endpoint = "/api/admin/escrows";
    if (section === "activity") endpoint = "/api/admin/activity";
    if (section === "clients") endpoint = "/api/admin/clients";
    if (section === "users") {
      const params = new URLSearchParams();
      if (userQuery) params.set("q", userQuery);
      if (userRole) params.set("role", userRole);
      if (userStatus) params.set("status", userStatus);
      endpoint = `/api/admin/users?${params.toString()}`;
    }
    if (section === "models" && modelView === "approved") {
      endpoint = "/api/admin/models?status=approved";
    }
    if (section === "content" && contentView === "approved") {
      endpoint = "/api/admin/content?status=approved";
    }
    if (section === "payments") {
      const params = new URLSearchParams();
      if (paymentView === "approved") {
        params.set("status", "approved");
      }
      if (paymentProvider !== "all") {
        params.set("provider", paymentProvider);
      }
      if (paymentRange !== "all") {
        params.set("range", paymentRange);
      }
      endpoint = `/api/admin/payments?${params.toString()}`;
    }
    if (section === "escrows") {
      const params = new URLSearchParams();
      if (escrowView === "released") {
        params.set("status", "released");
      }
      if (escrowRange !== "all") {
        params.set("range", escrowRange);
      }
      endpoint = `/api/admin/escrows?${params.toString()}`;
    }
    if (section === "disputes") {
      endpoint = "/api/admin/escrows?status=disputed";
    }
    if (section === "clients" && clientView === "approved") {
      endpoint = "/api/admin/clients?status=approved";
    }
    if (section === "clients" && clientView === "pending") {
      endpoint = "/api/admin/clients?status=pending";
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
  }, [
    initData,
    section,
    modelView,
    contentView,
    paymentView,
    paymentProvider,
    paymentRange,
    escrowView,
    escrowRange,
    clientView,
    userQuery,
    userRole,
    userStatus,
  ]);

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

  const loadHealth = useCallback(async () => {
    if (!initData) {
      return;
    }
    const res = await fetch("/api/admin/health", {
      headers: { "x-telegram-init": initData },
    });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    if (data?.ok) {
      setHealth((prev) => ({ ...prev, ...data }));
    }
  }, [initData]);

  useEffect(() => {
    loadQueue();
    loadMetrics();
    loadHealth();
  }, [loadQueue, loadMetrics, loadHealth]);

  useEffect(() => {
    if (!initData) {
      return;
    }
    loadNotifications(true).catch(() => null);
    const interval = setInterval(() => {
      loadNotifications(true).catch(() => null);
    }, 30000);
    return () => clearInterval(interval);
  }, [initData]);

  useEffect(() => {
    if (!liveQueue) {
      return;
    }
    setLiveCountdown(15);
    const interval = setInterval(() => {
      if (livePaused) {
        return;
      }
      setLiveCountdown((prev) => {
        if (prev <= 1) {
          loadQueue();
          loadMetrics();
          loadHealth();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [liveQueue, livePaused, loadQueue, loadMetrics, loadHealth]);

  useEffect(() => {
    if (!initData || liveQueue || livePaused) {
      return;
    }
    if (!["models", "users"].includes(section)) {
      return;
    }
    const interval = setInterval(() => {
      loadQueue();
      loadMetrics();
    }, 20000);
    return () => clearInterval(interval);
  }, [initData, liveQueue, livePaused, section, loadQueue, loadMetrics]);

  useEffect(() => {
    setSelectedItem(null);
    setPreview({ open: false, url: "", type: "video" });
    setSelectedKeys([]);
  }, [
    section,
    modelView,
    contentView,
    paymentView,
    paymentProvider,
    paymentRange,
    escrowView,
    escrowRange,
    clientView,
    userQuery,
    userRole,
    userStatus,
  ]);

  useEffect(() => {
    if (!pendingHighlight || !filteredItems.length) {
      return;
    }
    const match = filteredItems.find((item) => {
      if (pendingHighlight.sessionId && Number(item.related_id || item.id) === Number(pendingHighlight.sessionId)) {
        return true;
      }
      if (pendingHighlight.contentId && Number(item.id) === Number(pendingHighlight.contentId)) {
        return true;
      }
      return false;
    });
    if (match) {
      setSelectedItem(match);
      setPendingHighlight(null);
    }
  }, [filteredItems, pendingHighlight]);

  const performAction = async (action, payload) => {
    if (!initData) {
      setError("Open the admin console inside Telegram.");
      return false;
    }
    const res = await fetch(action, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-init": initData },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError(`Action failed (HTTP ${res.status}).`);
      return false;
    }
    setError("");
    return true;
  };

  const handleAction = async (action, payload) => {
    const ok = await performAction(action, payload);
    if (!ok) {
      return;
    }
    setSelectedItem(null);
    await loadQueue();
    await loadMetrics();
  };

  const runBulkAction = async (action, payloadBuilder) => {
    if (!selectedKeys.length) {
      return;
    }
    let successCount = 0;
    for (const key of selectedKeys) {
      const item = filteredItems.find((entry) => String(getItemKey(entry)) === String(key));
      if (!item) {
        continue;
      }
      const payload = payloadBuilder(item);
      if (!payload) {
        continue;
      }
      // Run sequentially to preserve API ordering and avoid burst limits.
      const ok = await performAction(action, payload);
      if (ok) {
        successCount += 1;
      }
    }
    if (successCount > 0) {
      setError("");
      setSelectedKeys([]);
      await loadQueue();
      await loadMetrics();
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (event) => {
      if (!selectedItem) {
        return;
      }
      const target = event.target;
      if (
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "a" && key !== "r") {
        return;
      }
      if (section === "models" && modelView === "pending") {
        if (key === "a") {
          handleAction("/api/admin/models/approve", { user_id: selectedItem.user_id });
        } else {
          handleAction("/api/admin/models/reject", { user_id: selectedItem.user_id });
        }
      } else if (section === "content" && contentView === "pending") {
        if (key === "a") {
          handleAction("/api/admin/content/approve", { content_id: selectedItem.id });
        } else {
          handleAction("/api/admin/content/reject", { content_id: selectedItem.id });
        }
      } else if (section === "payments" && paymentView === "pending") {
        if (key === "a") {
          handleAction("/api/admin/payments/approve", {
            transaction_ref: selectedItem.transaction_ref,
          });
        } else {
          handleAction("/api/admin/payments/reject", {
            transaction_ref: selectedItem.transaction_ref,
          });
        }
      } else if (section === "escrows" && escrowView === "pending") {
        if (key === "a") {
          handleAction("/api/admin/escrows/release", { escrow_ref: selectedItem.escrow_ref });
        } else {
          handleAction("/api/admin/escrows/refund", { escrow_ref: selectedItem.escrow_ref });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItem, section, modelView, contentView, paymentView, escrowView, handleAction]);

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

  const loadNotifications = async (silent = false) => {
    if (!initData) {
      return;
    }
    if (!silent) {
      setNotifications((prev) => ({ ...prev, loading: true, error: "" }));
    }
    try {
      const res = await fetch("/api/admin/notifications", {
        headers: { "x-telegram-init": initData },
        cache: "no-store",
      });
      if (!res.ok) {
        setNotifications((prev) => ({
          ...prev,
          loading: false,
          error: `Unable to load notifications (HTTP ${res.status}).`,
        }));
        return;
      }
      const data = await res.json();
      setNotifications((prev) => ({
        ...prev,
        items: data.items || [],
        unread: Number(data.unread || 0),
        loading: false,
        error: "",
      }));
    } catch {
      setNotifications((prev) => ({
        ...prev,
        loading: false,
        error: "Unable to load notifications.",
      }));
    }
  };

  const markNotificationsRead = async (ids = []) => {
    if (!initData) {
      return;
    }
    try {
      await fetch("/api/admin/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          ids: Array.isArray(ids) ? ids : [],
        }),
      });
    } catch {
      // ignore
    }
  };

  const openNotifications = () => {
    setNotifications((prev) => ({ ...prev, open: true }));
    loadNotifications(true).catch(() => null);
  };

  const closeNotifications = () => {
    const unreadIds = (notifications.items || [])
      .filter((item) => !item.read_at)
      .map((item) => item.id)
      .filter(Boolean);
    if (unreadIds.length) {
      markNotificationsRead(unreadIds).catch(() => null);
    }
    setNotifications((prev) => ({
      ...prev,
      open: false,
      unread: 0,
      items: (prev.items || []).map((item) =>
        item.read_at ? item : { ...item, read_at: item.read_at || new Date().toISOString() }
      ),
    }));
  };

  const formatNotificationTime = (value) => {
    if (!value) {
      return "";
    }
    try {
      return new Date(value).toLocaleString();
    } catch {
      return "";
    }
  };

  const parseNotificationMetadata = (metadata) => {
    if (!metadata) {
      return {};
    }
    if (typeof metadata === "object") {
      return metadata;
    }
    if (typeof metadata === "string") {
      try {
        return JSON.parse(metadata);
      } catch {
        return {};
      }
    }
    return {};
  };

  const notificationGroups = useMemo(() => {
    const groups = [];
    for (const item of notifications.items || []) {
      const date = item?.created_at ? new Date(item.created_at) : null;
      const label = date && !Number.isNaN(date.getTime()) ? date.toDateString() : "Recent";
      const bucket = groups.find((entry) => entry.label === label);
      if (bucket) {
        bucket.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
    }
    return groups;
  }, [notifications.items]);

  const notificationContext = (item) => {
    const meta = parseNotificationMetadata(item?.metadata);
    if (meta?.session_id) {
      return `Session #${meta.session_id}`;
    }
    if (meta?.content_id) {
      return `Content #${meta.content_id}`;
    }
    if (meta?.amount) {
      return `Amount: ₦${Number(meta.amount || 0).toLocaleString()}`;
    }
    return item?.type ? item.type.replace(/_/g, " ") : "General";
  };

  const handleNotificationClick = async (item) => {
    if (item?.id) {
      await markNotificationsRead([item.id]);
      setNotifications((prev) => ({
        ...prev,
        unread: Math.max(0, (prev.unread || 0) - (item?.read_at ? 0 : 1)),
        items: (prev.items || []).map((entry) =>
          entry.id === item.id ? { ...entry, read_at: entry.read_at || new Date().toISOString() } : entry
        ),
      }));
    }
    const type = (item?.type || "").toLowerCase();
    const meta = parseNotificationMetadata(item?.metadata);
    if (type.includes("dispute")) {
      setSection("disputes");
      if (meta?.session_id) {
        setPendingHighlight({ sessionId: meta.session_id });
      }
    } else if (type.includes("content")) {
      setSection("content");
      if (meta?.content_id) {
        setPendingHighlight({ contentId: meta.content_id });
      }
    } else if (type.includes("payment") || type.includes("escrow")) {
      setSection("payments");
    } else if (type.includes("model") || type.includes("verification")) {
      setSection("models");
    } else if (type.includes("client")) {
      setSection("clients");
    }
    closeNotifications();
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
          <span className="logo-mark small">
            <img src="/brand/logo.png" alt="Velvet Rooms logo" />
          </span>
          <span className="logo-text">Velvet Rooms</span>
          <span className="admin-pill">Admin</span>
        </div>
        <label className="field admin-select">
          Section
          <select value={section} onChange={(event) => setSection(event.target.value)}>
            <option value="models">Model Queue</option>
            <option value="content">Content Queue</option>
            <option value="payments">Payments</option>
            <option value="clients">Client Queue</option>
            <option value="escrows">Escrow Releases</option>
            <option value="disputes">Disputes</option>
            <option value="users">Users</option>
            <option value="activity">Activity</option>
            <option value="health">Health</option>
          </select>
        </label>
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
            className={`ghost ${section === "clients" ? "active" : ""}`}
            onClick={() => setSection("clients")}
          >
            Client Queue
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
          <button
            type="button"
            className={`ghost ${section === "users" ? "active" : ""}`}
            onClick={() => setSection("users")}
          >
            Users
          </button>
          <button
            type="button"
            className={`ghost ${section === "activity" ? "active" : ""}`}
            onClick={() => setSection("activity")}
          >
            Activity
          </button>
          <button
            type="button"
            className={`ghost ${section === "health" ? "active" : ""}`}
            onClick={() => setSection("health")}
          >
            Health
          </button>
        </div>
        <button
          type="button"
          className="icon-btn notice-bell"
          onClick={() => (notifications.open ? closeNotifications() : openNotifications())}
          aria-label="Notifications"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22a2.5 2.5 0 0 0 2.45-2H9.55A2.5 2.5 0 0 0 12 22zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
          </svg>
          {notifications.unread > 0 && (
            <span className="notify-badge">
              {notifications.unread > 99 ? "99+" : notifications.unread}
            </span>
          )}
        </button>
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
            {revenueSeries.map((entry) => (
              <span
                key={`rev-${entry.day}`}
                style={{ height: `${(Number(entry.amount || 0) / maxRevenue) * 100}%` }}
              />
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
            {approvalsSeries.map((entry) => (
              <span
                key={`queue-${entry.day}`}
                style={{ height: `${(Number(entry.count || 0) / maxApprovals) * 100}%` }}
              />
            ))}
          </div>
          <div className="insight-foot">
            <span>Median review time</span>
            <strong>
              {metrics.median_review_seconds
                ? `${Math.round(Number(metrics.median_review_seconds || 0) / 60)}m`
                : "—"}
            </strong>
          </div>
        </div>
        <div className="insight-card">
          <h3>Risk Signals</h3>
          <p>Flags and disputes (24h)</p>
          <div className="signal-stack">
            <div>
              <span>High‑risk flags</span>
              <strong>{formatNumber(metrics.disputes_24h)}</strong>
            </div>
            <div>
              <span>Payment retries</span>
              <strong>{formatNumber(metrics.failed_payments_24h)}</strong>
            </div>
            <div>
              <span>Chargeback risk</span>
              <strong>0</strong>
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
              : section === "clients"
              ? "Client Access Queue"
              : section === "escrows"
              ? "Manual Releases"
              : section === "activity"
              ? "User Activity"
              : section === "users"
              ? "All Users"
              : "Dispute Desk"}
          </h2>
          <p>
            {section === "models"
              ? "Review verification video, approve or reject, then unlock model tools."
              : section === "content"
              ? "Approve teasers before they appear in the gallery."
              : section === "payments"
              ? "Approve payments before escrows are created."
              : section === "clients"
              ? "Track client onboarding, access fees, and unlock status."
              : section === "escrows"
              ? "Release or refund escrow funds manually."
              : section === "activity"
              ? "Follow, block, and report actions across the platform."
              : section === "users"
              ? "Search every account, track roles, and monitor activity."
              : section === "health"
              ? "Monitor call stability, session failures, and TURN errors."
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
              <div className="filter-row">
                <button
                  type="button"
                  className={`pill ${paymentRange === "all" ? "active" : ""}`}
                  onClick={() => setPaymentRange("all")}
                >
                  All time
                </button>
                <button
                  type="button"
                  className={`pill ${paymentRange === "today" ? "active" : ""}`}
                  onClick={() => setPaymentRange("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`pill ${paymentRange === "7d" ? "active" : ""}`}
                  onClick={() => setPaymentRange("7d")}
                >
                  Last 7 days
                </button>
              </div>
              <div className="filter-row">
                <button
                  type="button"
                  className={`pill ${paymentProvider === "all" ? "active" : ""}`}
                  onClick={() => setPaymentProvider("all")}
                >
                  All providers
                </button>
                <button
                  type="button"
                  className={`pill ${paymentProvider === "flutterwave" ? "active" : ""}`}
                  onClick={() => setPaymentProvider("flutterwave")}
                >
                  Flutterwave
                </button>
                <button
                  type="button"
                  className={`pill ${paymentProvider === "crypto" ? "active" : ""}`}
                  onClick={() => setPaymentProvider("crypto")}
                >
                  Crypto
                </button>
                <button
                  type="button"
                  className={`pill ${paymentProvider === "wallet" ? "active" : ""}`}
                  onClick={() => setPaymentProvider("wallet")}
                >
                  Wallet
                </button>
              </div>
            </div>
          )}
          {section === "clients" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${clientView === "pending" ? "primary" : "ghost"}`}
                onClick={() => setClientView("pending")}
              >
                Pending access
              </button>
              <button
                type="button"
                className={`cta ${clientView === "approved" ? "primary" : "ghost"}`}
                onClick={() => setClientView("approved")}
              >
                Unlocked clients
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
              <div className="filter-row">
                <button
                  type="button"
                  className={`pill ${escrowRange === "all" ? "active" : ""}`}
                  onClick={() => setEscrowRange("all")}
                >
                  All time
                </button>
                <button
                  type="button"
                  className={`pill ${escrowRange === "today" ? "active" : ""}`}
                  onClick={() => setEscrowRange("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`pill ${escrowRange === "7d" ? "active" : ""}`}
                  onClick={() => setEscrowRange("7d")}
                >
                  Last 7 days
                </button>
              </div>
            </div>
          )}
          {section === "users" && (
            <div className="panel-actions">
              <label className="field">
                Search
                <input
                  type="text"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Search name, email, ID"
                />
              </label>
              <label className="field">
                Role
                <select
                  value={userRole}
                  onChange={(event) => setUserRole(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="client">Client</option>
                  <option value="model">Model</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                Status
                <select
                  value={userStatus}
                  onChange={(event) => setUserStatus(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </div>
          )}
          {section !== "health" ? (
            <div className="panel-actions">
              <button
                type="button"
                className={`cta ${liveQueue ? "primary" : "ghost"}`}
                onClick={() => setLiveQueue((prev) => !prev)}
              >
                {liveQueue ? "Live queue on" : "Open live queue"}
              </button>
              <button type="button" className="cta ghost" onClick={loadQueue}>
                Refresh now
              </button>
              <button type="button" className="cta ghost" onClick={exportAuditLog}>
                Export audit log
              </button>
              <button type="button" className="cta ghost" onClick={saveCurrentFilter}>
                Save filter
              </button>
              {savedFilters.length > 0 && (
                <label className="field">
                  Saved filter
                  <select defaultValue="" onChange={(event) => applySavedFilter(event.target.value)}>
                    <option value="">Load saved…</option>
                    {savedFilters.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <div className="panel-actions">
              <button type="button" className="cta ghost" onClick={loadHealth}>
                Refresh health
              </button>
            </div>
          )}
          {section !== "health" && (
            <div className="panel-actions">
              <button
                type="button"
                className={`pill ${queueTriage === "all" ? "active" : ""}`}
                onClick={() => setQueueTriage("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`pill ${queueTriage === "urgent" ? "active" : ""}`}
                onClick={() => setQueueTriage("urgent")}
              >
                Urgent
              </button>
              <button
                type="button"
                className={`pill ${queueTriage === "aging" ? "active" : ""}`}
                onClick={() => setQueueTriage("aging")}
              >
                Aging
              </button>
              <button
                type="button"
                className={`pill ${queueTriage === "high_risk" ? "active" : ""}`}
                onClick={() => setQueueTriage("high_risk")}
              >
                High risk
              </button>
            </div>
          )}
          {section !== "health" && liveQueue && (
            <p className="helper">
              {livePaused
                ? pageHidden
                  ? "Live queue paused while tab is hidden."
                  : "Live queue paused while viewing details."
                : `Next refresh in ${liveCountdown}s.`}
            </p>
          )}
          {lastRefreshAt && (
            <p className="helper">Last refresh: {new Date(lastRefreshAt).toLocaleString()}</p>
          )}
          <div data-sync-tick={syncTicker}>
            <SyncIndicator lastSyncedAt={lastRefreshAt} active={liveQueue && !livePaused} />
          </div>
          <div className="admin-pill">Manual approvals only • 18+ content</div>
        </aside>

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
        {section === "health" ? (
          <div className="health-grid">
            <div className="metric-card">
              <span>Sessions (7d)</span>
              <strong>{formatNumber(health.total_sessions_7d)}</strong>
              <p className="helper">
                Failed: {formatNumber(health.failed_sessions_7d)} · Rate:{" "}
                {Math.round((health.session_failure_rate_7d || 0) * 100)}%
              </p>
            </div>
            <div className="metric-card">
              <span>Disputes (7d)</span>
              <strong>{formatNumber(health.disputes_7d)}</strong>
              <p className="helper">Track repeated disputes and no-show patterns.</p>
            </div>
            <div className="metric-card">
              <span>Call setup failures (24h)</span>
              <strong>{formatNumber(health.call_setup_failures_24h)}</strong>
              <p className="helper">
                Failure rate: {Math.round((health.call_setup_failure_rate_24h || 0) * 100)}%
              </p>
            </div>
            <div className="metric-card">
              <span>TURN token errors (24h)</span>
              <strong>{formatNumber(health.turn_token_errors_24h)}</strong>
              <p className="helper">Twilio token failures and TURN outages.</p>
            </div>
          </div>
        ) : (
          <div className={`admin-queue ${selectedItem ? "has-detail" : ""}`}>
            <div className="admin-list">
              <div className="panel-actions">
                <button
                  type="button"
                  className="cta ghost"
                  onClick={() =>
                    setSelectedKeys(
                      filteredItems
                        .map((item) => getItemKey(item))
                        .filter(Boolean)
                        .map((key) => String(key))
                    )
                  }
                >
                  Select all
                </button>
                <button type="button" className="cta ghost" onClick={() => setSelectedKeys([])}>
                  Clear
                </button>
                {selectedKeys.length > 0 && section === "models" && modelView === "pending" && (
                  <>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() =>
                        runBulkAction("/api/admin/models/approve", (item) => ({ user_id: item.user_id }))
                      }
                    >
                      Bulk approve ({selectedKeys.length})
                    </button>
                    <button
                      type="button"
                      className="cta primary alt"
                      onClick={() =>
                        runBulkAction("/api/admin/models/reject", (item) => ({ user_id: item.user_id }))
                      }
                    >
                      Bulk reject
                    </button>
                  </>
                )}
                {selectedKeys.length > 0 && section === "content" && contentView === "pending" && (
                  <>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() =>
                        runBulkAction("/api/admin/content/approve", (item) => ({ content_id: item.id }))
                      }
                    >
                      Bulk approve ({selectedKeys.length})
                    </button>
                    <button
                      type="button"
                      className="cta primary alt"
                      onClick={() =>
                        runBulkAction("/api/admin/content/reject", (item) => ({ content_id: item.id }))
                      }
                    >
                      Bulk reject
                    </button>
                  </>
                )}
              </div>
              {error && <ErrorState message={error} onRetry={loadQueue} />}
              {!error && (
                <div className="empty subtle">Live queue updates when new submissions arrive.</div>
              )}
              {!error && filteredItems.length === 0 && <EmptyState title="Queue is empty." />}
              {!error &&
                filteredItems.map((item) => {
                  const itemKey =
                    item.user_id || item.id || item.escrow_ref || item.transaction_ref;
                  const selectedKey = selectedItem
                    ? selectedItem.user_id ||
                      selectedItem.id ||
                      selectedItem.escrow_ref ||
                      selectedItem.transaction_ref
                    : null;
                  return (
                    <article
                      key={itemKey}
                      className={`queue-card ${selectedKey === itemKey ? "selected" : ""}`}
                    >
                      <label className="pill">
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(String(itemKey))}
                          onChange={(event) => {
                            setSelectedKeys((prev) => {
                              const key = String(itemKey);
                              if (event.target.checked) {
                                return prev.includes(key) ? prev : [...prev, key];
                              }
                              return prev.filter((entry) => entry !== key);
                            });
                          }}
                        />
                        Select
                      </label>
                      <div>
                        <p className="queue-id">
                          {(section === "payments" && resolveName(item)) ||
                            item.public_id ||
                            item.escrow_ref ||
                            item.transaction_ref ||
                            item.id}
                        </p>
                        <h3>
                          {section === "users"
                            ? resolveName(item, "User")
                            : section === "clients"
                            ? item.display_name || resolveName(item, "Client")
                            : section === "activity"
                            ? item.action_type || "Activity"
                            : item.display_name || item.title || item.escrow_type || "Payment"}
                        </h3>
                        <p className="queue-meta">
                          {section === "models" &&
                            (modelView === "approved"
                              ? "Verified model"
                              : "Verification pending")}
                          {section === "content" &&
                            (contentView === "approved"
                              ? "Approved content"
                              : "Content awaiting approval")}
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
                          {section === "clients" &&
                            `${item.access_fee_paid ? "Unlocked" : "Pending"} · ${
                              item.email || "no email"
                            }`}
                          {section === "users" &&
                            `${item.role || "user"} · ${item.status || "status"}`}
                          {section === "activity" &&
                            `${item.actor_display_name || item.actor_public_id || "Actor"} → ${
                              item.target_display_name || item.target_public_id || "Target"
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
                              {formatPresence(item.is_online, item.last_seen_at)}
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
                              {formatPresence(item.is_online, item.last_seen_at)}
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
                        {section === "users" && (
                          <>
                            <div
                              className={`status-pill ${item.status === "active" ? "live" : "idle"}`}
                            >
                              {item.status || "status"}
                            </div>
                            <div className={`status-pill ${item.is_online ? "live" : "idle"}`}>
                              {formatPresence(item.is_online, item.last_seen_at)}
                            </div>
                          </>
                        )}
                        {section === "clients" && (
                          <>
                            <div
                              className={`status-pill ${
                                item.access_fee_paid ? "live" : "idle"
                              }`}
                            >
                              {item.access_fee_paid ? "Unlocked" : "Pending"}
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
            {selectedItem && (
              <aside className="admin-detail-panel">
              <div className="admin-detail-top">
                <strong>Details</strong>
                <button
                  type="button"
                  className="cta ghost"
                  onClick={() => setSelectedItem(null)}
                >
                  Close
                </button>
              </div>
              <article className="admin-detail">
                <div className="admin-detail-header">
                  <div>
                    <p className="queue-id">
                      {(section === "payments" && resolveName(selectedItem)) ||
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
                      {section === "users" &&
                        `${selectedItem.role || "user"} · ${selectedItem.status || "status"}`}
                      {section === "activity" && `${selectedItem.action_type || "activity"} logged`}
                    </p>
                  </div>
                  <div className="queue-actions">
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
            </aside>
          )}
        </div>
        )}
      </section>

      {notifications.open && (
        <section className="notification-overlay" onClick={closeNotifications}>
          <div className="notification-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">Inbox</p>
                <h3>Notifications</h3>
              </div>
              <button type="button" className="cta ghost" onClick={closeNotifications}>
                Close
              </button>
            </header>
            {notifications.loading && <p className="helper">Loading notifications…</p>}
            {notifications.error && <p className="helper error">{notifications.error}</p>}
            {!notifications.loading && notifications.items.length === 0 && (
              <p className="helper">No notifications yet.</p>
            )}
            <div className="notification-list">
              {notificationGroups.map((group) => (
                <div key={`admin-notif-group-${group.label}`} className="notification-group">
                  <p className="notification-group-label">{group.label}</p>
                  {group.items.map((item) => (
                    <div
                      key={`admin-notif-${item.id}`}
                      className={`notification-item ${item.read_at ? "" : "unread"}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNotificationClick(item).catch(() => null);
                        }
                      }}
                    >
                      <div>
                        <div className="notification-title-row">
                          <strong>{item.title}</strong>
                          <NotificationPriorityBadge type={item.type || ""} />
                        </div>
                        {item.body && <p>{item.body}</p>}
                        <p className="notification-context">{notificationContext(item)}</p>
                      </div>
                      <span className="notification-time">
                        {formatNotificationTime(item.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
