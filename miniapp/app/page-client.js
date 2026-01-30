"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const searchParams = useSearchParams();
  const contentId = searchParams.get("content");
  const modelId = searchParams.get("model_id") || searchParams.get("model");
  const [role, setRole] = useState(null);
  const [roleLocked, setRoleLocked] = useState(false);
  const [lockedRole, setLockedRole] = useState(null);
  const [roleStatus, setRoleStatus] = useState("");
  const [clientStep, setClientStep] = useState(1);
  const [modelStep, setModelStep] = useState(1);
  const [initData, setInitData] = useState("");
  const [booting, setBooting] = useState(true);
  const [clientLoading, setClientLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [contentSubmitting, setContentSubmitting] = useState(false);
  const [clientTab, setClientTab] = useState("gallery");
  const [modelTab, setModelTab] = useState("profile");
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [modelContentFilter, setModelContentFilter] = useState("all");
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
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryJoinStatus, setGalleryJoinStatus] = useState({
    joined: false,
    status: "",
    checked: false,
  });
  const [galleryJoinError, setGalleryJoinError] = useState("");
  const [galleryInviteLink, setGalleryInviteLink] = useState("");
  const [clientPurchases, setClientPurchases] = useState([]);
  const [clientPurchasesStatus, setClientPurchasesStatus] = useState("");
  const [clientPurchasesLoading, setClientPurchasesLoading] = useState(false);
  const [clientSessions, setClientSessions] = useState([]);
  const [clientSessionsStatus, setClientSessionsStatus] = useState("");
  const [clientSessionsLoading, setClientSessionsLoading] = useState(false);
  const [clientDeleteStatus, setClientDeleteStatus] = useState("");
  const [avatarState, setAvatarState] = useState({
    file: null,
    name: "",
    status: "",
    uploading: false,
  });
  const [followState, setFollowState] = useState({});
  const [visibleTeasers, setVisibleTeasers] = useState({});
  const [consumedTeasers, setConsumedTeasers] = useState({});
  const [previewOverlay, setPreviewOverlay] = useState({
    open: false,
    item: null,
    remaining: 0,
  });
  const [showContentForm, setShowContentForm] = useState(false);
  const [contentStatus, setContentStatus] = useState("");
  const [modelItems, setModelItems] = useState([]);
  const [modelItemsStatus, setModelItemsStatus] = useState("");
  const [myBookings, setMyBookings] = useState([]);
  const [myBookingsStatus, setMyBookingsStatus] = useState("");
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [bookingActionStatus, setBookingActionStatus] = useState({});
  const [sessionActionStatus, setSessionActionStatus] = useState({});
  const [disputeState, setDisputeState] = useState({
    open: false,
    sessionId: null,
    reason: "",
    status: "",
    loading: false,
  });
  const [modelEarnings, setModelEarnings] = useState(null);
  const [modelEarningsStatus, setModelEarningsStatus] = useState("");
  const [contentForm, setContentForm] = useState({
    title: "",
    description: "",
    unlockPrice: "",
    contentType: "image",
    mediaFile: null,
    mediaName: "",
    fullFile: null,
    fullName: "",
  });
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const [accessPaymentMethod, setAccessPaymentMethod] = useState("flutterwave");
  const [contentPaymentMethod, setContentPaymentMethod] = useState({});
  const [paymentState, setPaymentState] = useState({
    open: false,
    mode: null,
    contentId: null,
    session: null,
    amount: null,
    transactionRef: "",
    networks: [],
    currencies: [],
    wallets: {},
    selectedNetwork: "",
    selectedCurrency: "",
    txHash: "",
    submitting: false,
    status: "",
  });
  const [bookingSheet, setBookingSheet] = useState({
    open: false,
    modelId: null,
    modelName: "",
    sessionType: "video",
    duration: 10,
    price: 9000,
    status: "",
    paymentMethod: "flutterwave",
    scheduledFor: "",
    loading: false,
  });
  const [extensionSheet, setExtensionSheet] = useState({
    open: false,
    sessionId: null,
    sessionType: "",
    minutes: 5,
    price: 0,
    paymentMethod: "flutterwave",
    status: "",
    loading: false,
  });
  const avatarUrl = profile?.user?.avatar_url || "";
  const teaserViewMs = 60000;
  const sessionPricing = {
    chat: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
    voice: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
    video: { 5: 5000, 10: 9000, 20: 16000, 30: 22000 },
  };
  const extensionPricing = {
    voice: 1500,
    video: 4000,
  };

  const getSessionPrice = (type, duration) =>
    sessionPricing[type]?.[duration] ?? null;
  const getExtensionPrice = (type) => extensionPricing[type] ?? null;
  const formatSessionStatus = (status) => {
    switch (status) {
      case "pending_payment":
        return "Awaiting payment verification";
      case "pending":
        return "Awaiting model acceptance";
      case "accepted":
        return "Accepted · waiting to start";
      case "active":
        return "Active";
      case "awaiting_confirmation":
        return "Awaiting confirmation";
      case "disputed":
        return "Disputed";
      case "completed":
        return "Completed";
      case "rejected":
        return "Rejected by admin";
      case "cancelled_by_client":
        return "Cancelled by client";
      case "cancelled_by_model":
        return "Cancelled by model";
      default:
        return status || "-";
    }
  };
  const getStatusTone = (status) => {
    switch (status) {
      case "active":
      case "completed":
      case "accepted":
        return "success";
      case "rejected":
      case "cancelled_by_client":
      case "cancelled_by_model":
      case "disputed":
        return "danger";
      case "pending":
      case "pending_payment":
      case "awaiting_confirmation":
        return "warning";
      default:
        return "";
    }
  };
  const toLocalInput = (date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  };
  const roundToNextHour = (date) => {
    const rounded = new Date(date);
    rounded.setMinutes(0, 0, 0);
    if (rounded < date) {
      rounded.setHours(rounded.getHours() + 1);
    }
    return rounded;
  };
  const scheduleBase = roundToNextHour(new Date());
  const scheduleMin = toLocalInput(scheduleBase);
  const scheduleMax = toLocalInput(new Date(scheduleBase.getTime() + 24 * 60 * 60 * 1000));
  const filteredModelItems = modelItems.filter((item) => {
    if (modelContentFilter === "approved") {
      return item.is_active;
    }
    if (modelContentFilter === "pending") {
      return !item.is_active;
    }
    return true;
  });

  const refreshBookings = async () => {
    if (!initData || role !== "model" || !modelApproved) {
      return;
    }
    setMyBookingsLoading(true);
    try {
      const res = await fetch("/api/sessions?scope=mine", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        setMyBookingsStatus(`Unable to load bookings (HTTP ${res.status}).`);
        setMyBookings([]);
        setMyBookingsLoading(false);
        return;
      }
      const data = await res.json();
      setMyBookings(data.items || []);
      setMyBookingsStatus("");
      setMyBookingsLoading(false);
    } catch {
      setMyBookingsStatus("Unable to load bookings.");
      setMyBookings([]);
      setMyBookingsLoading(false);
    }
  };

  const handleBookingAction = async (sessionId, action) => {
    if (!initData || !sessionId) {
      return;
    }
    setBookingActionStatus((prev) => ({
      ...prev,
      [sessionId]: { loading: true, error: "", info: "" },
    }));
    try {
      const res = await fetch("/api/sessions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, session_id: sessionId, action }),
      });
      if (!res.ok) {
        setBookingActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: `Action failed (HTTP ${res.status}).`,
            info: "",
          },
        }));
        return;
      }
      const data = await res.json();
      if (!data?.ok) {
        setBookingActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: data?.error || "Action failed.",
            info: "",
          },
        }));
        return;
      }
      if (data?.invite_link && window?.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(data.invite_link);
      }
      setBookingActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info:
            action === "accept"
              ? "Session accepted. Invite link sent."
              : action === "cancel"
              ? "Session cancelled. Client refunded."
              : "Session declined.",
        },
      }));
      await refreshBookings();
    } catch {
      setBookingActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "Action failed.",
          info: "",
        },
      }));
    }
  };

  const handleSessionJoin = async (sessionId) => {
    if (!initData || !sessionId) {
      return;
    }
    setSessionActionStatus((prev) => ({
      ...prev,
      [sessionId]: { loading: true, error: "", info: "" },
    }));
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, session_id: sessionId }),
      });
      if (!res.ok) {
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: `Unable to join (HTTP ${res.status}).`,
            info: "",
          },
        }));
        return;
      }
      const data = await res.json();
      if (!data?.invite_link) {
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: "Unable to create invite.",
            info: "",
          },
        }));
        return;
      }
      if (window?.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(data.invite_link);
      } else {
        window.open(data.invite_link, "_blank");
      }
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: "Session link opened.",
        },
      }));
    } catch {
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "Unable to join session.",
          info: "",
        },
      }));
    }
  };

  const handleSessionConfirm = async (sessionId) => {
    if (!initData || !sessionId) {
      return;
    }
    setSessionActionStatus((prev) => ({
      ...prev,
      [sessionId]: { loading: true, error: "", info: "" },
    }));
    try {
      const res = await fetch("/api/sessions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, session_id: sessionId }),
      });
      if (!res.ok) {
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: `Unable to confirm (HTTP ${res.status}).`,
            info: "",
          },
        }));
        return;
      }
      const data = await res.json();
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: data?.completed
            ? "Session completed."
            : "Thanks! Waiting for the other person.",
        },
      }));
      await refreshBookings();
    } catch {
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "Unable to confirm.",
          info: "",
        },
      }));
    }
  };

  const handleSessionCancel = async (sessionId) => {
    if (!initData || !sessionId) {
      return;
    }
    setSessionActionStatus((prev) => ({
      ...prev,
      [sessionId]: { loading: true, error: "", info: "" },
    }));
    try {
      const res = await fetch("/api/sessions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, session_id: sessionId }),
      });
      if (!res.ok) {
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: `Unable to cancel (HTTP ${res.status}).`,
            info: "",
          },
        }));
        return;
      }
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: "Session cancelled. Payment released to model.",
        },
      }));
      setClientSessions((prev) =>
        prev.map((item) =>
          item.id === sessionId ? { ...item, status: "cancelled_by_client" } : item
        )
      );
    } catch {
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "Unable to cancel.",
          info: "",
        },
      }));
    }
  };

  const submitDispute = async () => {
    if (!initData || !disputeState.sessionId) {
      return;
    }
    if (disputeState.reason.trim().length < 5) {
      setDisputeState((prev) => ({ ...prev, status: "Add a reason to continue." }));
      return;
    }
    setDisputeState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/sessions/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          session_id: disputeState.sessionId,
          reason: disputeState.reason,
        }),
      });
      if (!res.ok) {
        setDisputeState((prev) => ({
          ...prev,
          loading: false,
          status: `Dispute failed (HTTP ${res.status}).`,
        }));
        return;
      }
      setDisputeState({
        open: false,
        sessionId: null,
        reason: "",
        status: "Dispute submitted.",
        loading: false,
      });
    } catch {
      setDisputeState((prev) => ({ ...prev, loading: false, status: "Dispute failed." }));
    }
  };

  useEffect(() => {
    if (roleLocked) {
      return;
    }
    if (contentId || modelId) {
      setRole("client");
    }
  }, [contentId, modelId, roleLocked]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedRole = window.localStorage.getItem("vr_role");
    const locked = window.localStorage.getItem("vr_role_locked");
    if (storedRole && locked === "1") {
      setRoleLocked(true);
      setLockedRole(storedRole);
      setRole(storedRole);
    }
  }, []);

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
          window.localStorage.setItem("vr_init_data", tg.initData);
          return;
        }
      }
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tgData = search.get("tgWebAppData") || hash.get("tgWebAppData");
      if (tgData) {
        setInitData(tgData);
        window.localStorage.setItem("vr_init_data", tgData);
        return;
      }
      const cached = window.localStorage.getItem("vr_init_data");
      if (cached) {
        setInitData(cached);
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
    if (!initData) {
      return;
    }
    if (clientStatus?.includes("Open this mini app inside Telegram")) {
      setClientStatus("");
    }
    if (modelStatus?.includes("Open this mini app inside Telegram")) {
      setModelStatus("");
    }
  }, [initData, clientStatus, modelStatus]);

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
    if (!previewOverlay.open) {
      return;
    }
    const totalSeconds = Math.ceil(teaserViewMs / 1000);
    setPreviewOverlay((prev) => ({ ...prev, remaining: totalSeconds }));
    const interval = setInterval(() => {
      setPreviewOverlay((prev) => {
        const next = prev.remaining - 1;
        if (next <= 0) {
          return { open: false, item: null, remaining: 0 };
        }
        return { ...prev, remaining: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [previewOverlay.open, teaserViewMs]);

  useEffect(() => {
    if (!initData || role !== "client") {
      return;
    }
    const loadGallery = async () => {
      setGalleryLoading(true);
      try {
        const res = await fetch("/api/content", {
          headers: { "x-telegram-init": initData },
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 403) {
            let errorMessage = clientAccessPaid
              ? "Access approval still syncing. Tap refresh to retry."
              : "Access fee required to view the gallery.";
            try {
              const payload = await res.json();
              if (payload?.error === "client_only") {
                errorMessage =
                  "This account is locked to the model dashboard. Switch to model mode.";
                setRoleLocked(true);
                setLockedRole("model");
                setRole("model");
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("vr_role", "model");
                  window.localStorage.setItem("vr_role_locked", "1");
                }
              } else if (payload?.error === "access_fee_required") {
                errorMessage = "Access fee required to view the gallery.";
              }
            } catch {
              // ignore parse errors
            }
            setGalleryStatus(errorMessage);
            if (clientAccessPaid) {
              await refreshClientAccess(true);
            }
          } else {
            setGalleryStatus(`Gallery unavailable (HTTP ${res.status}).`);
          }
          setGalleryItems([]);
          setGalleryLoading(false);
          return;
        }
        const data = await res.json();
        setGalleryItems(data.items || []);
        setGalleryStatus("");
        setGalleryLoading(false);
      } catch {
        setGalleryStatus("Gallery unavailable.");
        setGalleryItems([]);
        setGalleryLoading(false);
      }
    };
    loadGallery();
  }, [initData, role, clientAccessPaid, galleryRefreshKey]);

  const checkGalleryMembership = async () => {
    if (!initData || role !== "client" || !clientAccessPaid) {
      return;
    }
    setGalleryJoinError("");
    try {
      const res = await fetch("/api/gallery/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) {
        setGalleryJoinStatus({ joined: false, status: "", checked: true });
        setGalleryJoinError(`Unable to check access (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      setGalleryJoinStatus({
        joined: Boolean(data?.joined),
        status: data?.status || "",
        checked: true,
      });
    } catch {
      setGalleryJoinStatus({ joined: false, status: "", checked: true });
      setGalleryJoinError("Unable to check access.");
    }
  };

  const requestGalleryInvite = async () => {
    if (!initData) {
      return;
    }
    setGalleryJoinError("");
    try {
      const res = await fetch("/api/gallery/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) {
        setGalleryJoinError(`Unable to create invite (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      const link = data?.invite_link || "";
      setGalleryInviteLink(link);
      if (link) {
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(link);
        } else {
          window.open(link, "_blank");
        }
      }
    } catch {
      setGalleryJoinError("Unable to create invite.");
    }
  };

  useEffect(() => {
    if (!initData || role !== "client" || !clientAccessPaid || clientTab !== "gallery") {
      return;
    }
    checkGalleryMembership();
  }, [initData, role, clientAccessPaid, clientTab]);

  useEffect(() => {
    if (!modelId || role !== "client" || galleryItems.length === 0) {
      return;
    }
    const match = galleryItems.find(
      (item) => String(item.model_id) === String(modelId)
    );
    if (match) {
      openBooking(match);
    }
  }, [modelId, role, galleryItems]);

  useEffect(() => {
    if (!initData || role !== "client" || clientTab !== "purchases") {
      return;
    }
    const loadPurchases = async () => {
      setClientPurchasesLoading(true);
      try {
        const res = await fetch("/api/purchases", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setClientPurchasesStatus(`Unable to load purchases (HTTP ${res.status}).`);
          setClientPurchases([]);
          setClientPurchasesLoading(false);
          return;
        }
        const data = await res.json();
        setClientPurchases(data.items || []);
        setClientPurchasesStatus("");
        setClientPurchasesLoading(false);
      } catch {
        setClientPurchasesStatus("Unable to load purchases.");
        setClientPurchases([]);
        setClientPurchasesLoading(false);
      }
    };
    loadPurchases();
  }, [initData, role, clientTab]);

  useEffect(() => {
    if (!initData || role !== "client" || clientTab !== "sessions") {
      return;
    }
    const loadSessions = async () => {
      setClientSessionsLoading(true);
      try {
        const res = await fetch("/api/sessions?scope=client", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setClientSessionsStatus(`Unable to load sessions (HTTP ${res.status}).`);
          setClientSessions([]);
          setClientSessionsLoading(false);
          return;
        }
        const data = await res.json();
        setClientSessions(data.items || []);
        setClientSessionsStatus("");
        setClientSessionsLoading(false);
      } catch {
        setClientSessionsStatus("Unable to load sessions.");
        setClientSessions([]);
        setClientSessionsLoading(false);
      }
    };
    loadSessions();
  }, [initData, role, clientTab]);

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
    if (!modelApproved || role !== "model" || modelTab !== "content") {
      return undefined;
    }
    const interval = setInterval(() => {
      setContentRefreshKey((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [modelApproved, role, modelTab]);

  useEffect(() => {
    if (!initData || role !== "client" || !clientAccessPaid || clientTab !== "gallery") {
      return;
    }
    const interval = setInterval(() => {
      setGalleryRefreshKey((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [initData, role, clientAccessPaid, clientTab]);

  useEffect(() => {
    if (!initData || role !== "model" || !modelApproved || modelTab !== "earnings") {
      return;
    }
    const loadEarnings = async () => {
      try {
        const res = await fetch("/api/earnings", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setModelEarningsStatus(`Unable to load earnings (HTTP ${res.status}).`);
          setModelEarnings(null);
          return;
        }
        const data = await res.json();
        setModelEarnings(data);
        setModelEarningsStatus("");
      } catch {
        setModelEarningsStatus("Unable to load earnings.");
        setModelEarnings(null);
      }
    };
    loadEarnings();
  }, [initData, role, modelApproved, modelTab]);

  useEffect(() => {
    if (!initData || role !== "model" || !modelApproved || modelTab !== "sessions") {
      return;
    }
    refreshBookings();
  }, [initData, role, modelApproved, modelTab]);

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
          setProfile(null);
          setRoleLocked(false);
          setLockedRole(null);
          setRole(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("vr_role");
            window.localStorage.removeItem("vr_role_locked");
          }
          return;
        }
        setProfile(data);
        if (data.user.role === "model") {
          setRoleLocked(true);
          setLockedRole("model");
          setRole("model");
          if (typeof window !== "undefined") {
            window.localStorage.setItem("vr_role", "model");
            window.localStorage.setItem("vr_role_locked", "1");
          }
          if (data.model?.verification_status === "approved") {
            setModelApproved(true);
            setModelStatus("Verified ✅ Your dashboard is unlocked.");
            setModelStep(4);
            setModelTab("profile");
          } else if (data.model?.verification_status) {
            setModelApproved(false);
            setModelStatus("Verification in review. You'll be notified when approved.");
            setModelStep(3);
          }
          if (data.model?.display_name) {
            setModelForm((prev) => ({ ...prev, stageName: data.model.display_name }));
          }
        } else if (data.user.role === "client") {
          setRoleLocked(true);
          setLockedRole("client");
          setRole("client");
          if (typeof window !== "undefined") {
            window.localStorage.setItem("vr_role", "client");
            window.localStorage.setItem("vr_role_locked", "1");
          }
          if (data.client?.access_fee_paid) {
            setClientStep(3);
            setClientTab("gallery");
          } else if (data.client) {
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
      } finally {
        setBooting(false);
      }
    };
    loadProfile();
  }, [initData]);

  useEffect(() => {
    if (initData) {
      return;
    }
    const timer = setTimeout(() => setBooting(false), 2000);
    return () => clearTimeout(timer);
  }, [initData]);

  useEffect(() => {
    if (clientAccessPaid) {
      setClientStep(3);
      setClientTab("gallery");
    }
  }, [clientAccessPaid]);

  useEffect(() => {
    if (profile?.client && !clientAccessPaid && clientStep < 2) {
      setClientStep(2);
    }
  }, [profile, clientAccessPaid, clientStep]);

  useEffect(() => {
    if (!initData || role !== "client" || clientAccessPaid) {
      return;
    }
    const interval = setInterval(() => {
      refreshClientAccess(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [initData, role, clientAccessPaid]);

  useEffect(() => {
    if (!initData || role !== "model" || modelApproved) {
      return;
    }
    const interval = setInterval(() => {
      refreshModelStatus();
    }, 25000);
    return () => clearInterval(interval);
  }, [initData, role, modelApproved]);

  useEffect(() => {
    if (!initData || role !== "client" || !clientAccessPaid) {
      return;
    }
    checkGalleryMembership();
  }, [initData, role, clientAccessPaid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (!payment) {
      return;
    }
    if (payment === "flutterwave") {
      setClientStatus("Payment received ✅ Await admin approval.");
      setTimeout(() => {
        refreshClientAccess();
      }, 1500);
    }
  }, []);

  const refreshClientAccess = async (silent = false) => {
    if (!initData) {
      if (!silent) {
        setClientStatus("Open this mini app inside Telegram to continue.");
      }
      return false;
    }
    try {
      const res = await fetch("/api/me", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        if (!silent) {
          setClientStatus("Unable to refresh access status.");
        }
        return false;
      }
      const data = await res.json();
      if (data.client?.access_fee_paid) {
        setClientAccessPaid(true);
        if (!silent) {
          setClientStatus("");
        }
        setClientStep(3);
        setClientTab("gallery");
        return true;
      } else {
        if (!silent) {
          setClientStatus("Access fee still pending admin approval.");
        }
        setClientAccessPaid(false);
        setClientStep(2);
        return false;
      }
    } catch {
      if (!silent) {
        setClientStatus("Unable to refresh access status.");
      }
      return false;
    }
  };
  const refreshGalleryAccess = async () => {
    await refreshClientAccess(false);
    setGalleryRefreshKey((prev) => prev + 1);
    await checkGalleryMembership();
  };

  const refreshModelStatus = async () => {
    if (!initData) {
      return;
    }
    try {
      const res = await fetch("/api/me", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        setModelStatus("Unable to refresh verification status.");
        return;
      }
      const data = await res.json();
      if (data.model?.verification_status === "approved") {
        setModelApproved(true);
        setModelStatus("Verified ✅ Your dashboard is unlocked.");
        setModelStep(4);
      } else if (data.model?.verification_status) {
        setModelApproved(false);
        setModelStatus("Verification in review. You'll be notified when approved.");
        setModelStep(3);
      }
    } catch {
      setModelStatus("Unable to refresh verification status.");
    }
  };

  const refreshProfile = async () => {
    if (!initData) {
      return;
    }
    try {
      const res = await fetch("/api/me", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setProfile(data);
      if (data.client?.access_fee_paid) {
        setClientAccessPaid(true);
        setClientStep(3);
      }
      if (data.model?.verification_status === "approved") {
        setModelApproved(true);
        setModelStep(4);
      }
    } catch {
      // ignore refresh errors
    }
  };

  const uploadToSignedUrl = async (signedUrl, file) => {
    try {
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      });
      return res;
    } catch (err) {
      return null;
    }
  };

  const deleteClientAccount = async () => {
    if (!initData) {
      setClientDeleteStatus("Open this mini app inside Telegram to continue.");
      return;
    }
    const confirmed = window.confirm(
      "Delete your account? This removes your profile, purchases, and access. This cannot be undone."
    );
    if (!confirmed) {
      return;
    }
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) {
        setClientDeleteStatus(`Delete failed (HTTP ${res.status}).`);
        return;
      }
      setClientDeleteStatus("Account deleted.");
      setClientAccessPaid(false);
      setProfile(null);
      setRole(null);
      setRoleLocked(false);
      setLockedRole(null);
      setClientStep(1);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("vr_role");
        window.localStorage.removeItem("vr_role_locked");
        window.localStorage.removeItem("vr_init_data");
      }
    } catch {
      setClientDeleteStatus("Delete failed. Try again.");
    }
  };

  const submitAvatar = async () => {
    if (!initData) {
      setAvatarState((prev) => ({
        ...prev,
        status: "Open this mini app inside Telegram to upload.",
      }));
      return;
    }
    if (!avatarState.file) {
      setAvatarState((prev) => ({ ...prev, status: "Choose a photo to upload." }));
      return;
    }
    setAvatarState((prev) => ({ ...prev, uploading: true, status: "Uploading…" }));
    try {
      const uploadInit = await fetch("/api/profile/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          filename: avatarState.file.name,
        }),
      });
      if (!uploadInit.ok) {
        setAvatarState((prev) => ({
          ...prev,
          uploading: false,
          status: "Unable to start upload.",
        }));
        return;
      }
      const payload = await uploadInit.json();
      if (!payload?.signed_url || !payload?.path) {
        setAvatarState((prev) => ({
          ...prev,
          uploading: false,
          status: "Upload link missing.",
        }));
        return;
      }
      const uploadRes = await uploadToSignedUrl(payload.signed_url, avatarState.file);
      if (!uploadRes || !uploadRes.ok) {
        const status = uploadRes?.status || "network";
        setAvatarState((prev) => ({
          ...prev,
          uploading: false,
          status: `Upload failed (${status}).`,
        }));
        return;
      }
      const saveRes = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, path: payload.path }),
      });
      if (!saveRes.ok) {
        setAvatarState((prev) => ({
          ...prev,
          uploading: false,
          status: "Unable to save avatar.",
        }));
        return;
      }
      setAvatarState({
        file: null,
        name: "",
        status: "Profile photo updated ✅",
        uploading: false,
      });
      await refreshProfile();
    } catch {
      setAvatarState((prev) => ({
        ...prev,
        uploading: false,
        status: "Upload failed. Try again.",
      }));
    }
  };

  const toggleFollow = async (modelId) => {
    if (!initData || !modelId) {
      return;
    }
    setFollowState((prev) => ({
      ...prev,
      [modelId]: { loading: true, error: "" },
    }));
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, target_id: modelId }),
      });
      if (!res.ok) {
        setFollowState((prev) => ({
          ...prev,
          [modelId]: { loading: false, error: "Unable to update follow." },
        }));
        return;
      }
      const data = await res.json();
      setGalleryItems((prev) =>
        prev.map((item) =>
          item.model_id === modelId
            ? { ...item, is_following: Boolean(data.following) }
            : item
        )
      );
      setFollowState((prev) => ({
        ...prev,
        [modelId]: { loading: false, error: "" },
      }));
      await refreshProfile();
    } catch {
      setFollowState((prev) => ({
        ...prev,
        [modelId]: { loading: false, error: "Unable to update follow." },
      }));
    }
  };

  const handleRole = (nextRole) => {
    if (roleLocked && lockedRole && nextRole !== lockedRole) {
      setRoleStatus(`This account is locked to the ${lockedRole} dashboard.`);
      return;
    }
    setRoleStatus("");
    setRole(nextRole);
    const target = document.getElementById(`${nextRole}-flow`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const goToRolePicker = () => {
    if (roleLocked) {
      setRoleStatus("This account is locked to the current role.");
      return;
    }
    setRoleStatus("");
    setRole(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openBooking = (item) => {
    const defaultType = "video";
    const defaultDuration = 10;
    const price = getSessionPrice(defaultType, defaultDuration);
    const defaultSchedule = scheduleMin;
    setBookingSheet({
      open: true,
      modelId: item.model_id,
      modelName: item.display_name || item.public_id || "Model",
      sessionType: defaultType,
      duration: defaultDuration,
      price: price || 0,
      status: "",
      paymentMethod: "flutterwave",
      scheduledFor: defaultSchedule,
      loading: false,
    });
  };

  const openExtension = (session) => {
    const price = getExtensionPrice(session.session_type);
    if (!price) {
      setClientStatus("Extensions are available for video or voice sessions only.");
      return;
    }
    setExtensionSheet({
      open: true,
      sessionId: session.id,
      sessionType: session.session_type,
      minutes: 5,
      price,
      paymentMethod: "flutterwave",
      status: "",
      loading: false,
    });
  };

  const openPreview = (item) => {
    if (consumedTeasers[item.id]) {
      return;
    }
    if (!item.preview_url) {
      setGalleryStatus("Preview unavailable. Try again later.");
      return;
    }
    setGalleryStatus("");
    setConsumedTeasers((prev) => ({ ...prev, [item.id]: true }));
    setPreviewOverlay({ open: true, item, remaining: Math.ceil(teaserViewMs / 1000) });
  };

  const closePreview = () => {
    setPreviewOverlay({ open: false, item: null, remaining: 0 });
  };

  const startFlutterwavePayment = async ({
    mode,
    contentId = null,
    session = null,
    onError,
  }) => {
    if (!initData) {
      const message = "Open this mini app inside Telegram to proceed.";
      if (onError) {
        onError(message);
      } else {
        setClientStatus(message);
      }
      return false;
    }
    try {
      const res = await fetch("/api/payments/flutterwave/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          escrow_type: mode === "access" ? "access_fee" : mode,
          content_id: contentId,
          model_id: session?.modelId,
          session_id: session?.sessionId,
          session_type: session?.sessionType,
          duration_minutes: session?.duration,
          scheduled_for: session?.scheduledFor,
          extension_minutes: session?.extensionMinutes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error
          ? `Flutterwave init failed: ${data.error}`
          : `Flutterwave init failed (HTTP ${res.status}).`;
        if (onError) {
          onError(message);
        } else {
          setClientStatus(message);
        }
        return false;
      }
      const data = await res.json();
      const link = data.payment_link;
      if (!link) {
        const message = "Flutterwave link missing.";
        if (onError) {
          onError(message);
        } else {
          setClientStatus(message);
        }
        return false;
      }
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(link);
      } else {
        window.location.href = link;
      }
      return true;
    } catch {
      const message = "Flutterwave init failed. Try again.";
      if (onError) {
        onError(message);
      } else {
        setClientStatus(message);
      }
      return false;
    }
  };

  useEffect(() => {
    if (!bookingSheet.open) {
      return;
    }
    const price = getSessionPrice(bookingSheet.sessionType, bookingSheet.duration);
    setBookingSheet((prev) => ({ ...prev, price: price || 0 }));
  }, [bookingSheet.open, bookingSheet.sessionType, bookingSheet.duration]);

  const startCryptoPayment = async ({
    mode,
    contentId = null,
    session = null,
    onError,
  }) => {
    if (!initData) {
      const message = "Open this mini app inside Telegram to proceed.";
      if (onError) {
        onError(message);
        return false;
      }
      setPaymentState((prev) => ({
        ...prev,
        open: true,
        status: message,
      }));
      return false;
    }
    const payload = {
      initData,
      escrow_type:
        mode === "access"
          ? "access_fee"
          : mode === "session"
          ? "session"
          : mode === "extension"
          ? "extension"
          : "content",
      content_id: contentId,
    };
    if (mode === "session" && session) {
      payload.model_id = session.modelId;
      payload.session_type = session.sessionType;
      payload.duration_minutes = session.duration;
      payload.scheduled_for = session.scheduledFor;
    }
    if (mode === "extension" && session) {
      payload.session_id = session.sessionId;
      payload.session_type = session.sessionType;
      payload.extension_minutes = session.extensionMinutes;
    }
    try {
      const res = await fetch("/api/payments/crypto/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error
          ? `Payment init failed: ${data.error}`
          : `Payment init failed (HTTP ${res.status}).`;
        if (onError) {
          onError(message);
          return false;
        }
        setPaymentState((prev) => ({
          ...prev,
          open: true,
          status: message,
        }));
        return false;
      }
      const data = await res.json();
      const networks = data.networks || [];
      const currencies = data.currencies || [];
      setPaymentState({
        open: true,
        mode,
        contentId,
        session,
        amount: data.amount,
        transactionRef: data.transaction_ref,
        networks,
        currencies,
        wallets: data.wallets || {},
        selectedNetwork: networks[0] || "",
        selectedCurrency: currencies[0] || "",
        txHash: "",
        submitting: false,
        status: "Send payment and submit the transaction hash.",
      });
      return true;
    } catch {
      const message = "Payment init failed. Try again.";
      if (onError) {
        onError(message);
        return false;
      }
      setPaymentState((prev) => ({
        ...prev,
        open: true,
        status: message,
      }));
      return false;
    }
  };

  const submitExtensionPayment = async () => {
    if (!extensionSheet.sessionId) {
      return;
    }
    const sessionPayload = {
      sessionId: extensionSheet.sessionId,
      sessionType: extensionSheet.sessionType,
      extensionMinutes: extensionSheet.minutes,
    };
    setExtensionSheet((prev) => ({ ...prev, loading: true, status: "" }));
    const onError = (message) =>
      setExtensionSheet((prev) => ({ ...prev, loading: false, status: message }));
    if (extensionSheet.paymentMethod === "crypto") {
      const ok = await startCryptoPayment({
        mode: "extension",
        session: sessionPayload,
        onError,
      });
      if (ok) {
        setExtensionSheet((prev) => ({ ...prev, open: false, loading: false }));
      }
      return;
    }
    const ok = await startFlutterwavePayment({
      mode: "extension",
      session: sessionPayload,
      onError,
    });
    if (ok) {
      setExtensionSheet((prev) => ({ ...prev, open: false, loading: false }));
    } else {
      setExtensionSheet((prev) => ({ ...prev, loading: false }));
    }
  };

  const submitBookingPayment = async () => {
    if (!bookingSheet.modelId) {
      return;
    }
    if (!bookingSheet.scheduledFor) {
      setBookingSheet((prev) => ({ ...prev, status: "Pick a schedule within 24 hours." }));
      return;
    }
    const scheduled = new Date(bookingSheet.scheduledFor);
    if (Number.isNaN(scheduled.getTime())) {
      setBookingSheet((prev) => ({ ...prev, status: "Pick a valid schedule time." }));
      return;
    }
    const minDate = scheduleBase;
    const maxDate = new Date(scheduleBase.getTime() + 24 * 60 * 60 * 1000);
    if (scheduled < minDate || scheduled > maxDate) {
      setBookingSheet((prev) => ({
        ...prev,
        status: "Schedule must be within the next 24 hours.",
      }));
      return;
    }
    const sessionPayload = {
      modelId: bookingSheet.modelId,
      sessionType: bookingSheet.sessionType,
      duration: bookingSheet.duration,
      scheduledFor: bookingSheet.scheduledFor,
    };
    setBookingSheet((prev) => ({ ...prev, loading: true, status: "" }));
    const onError = (message) =>
      setBookingSheet((prev) => ({ ...prev, loading: false, status: message }));
    if (bookingSheet.paymentMethod === "crypto") {
      const ok = await startCryptoPayment({
        mode: "session",
        session: sessionPayload,
        onError,
      });
      if (ok) {
        setBookingSheet((prev) => ({ ...prev, open: false, loading: false }));
      }
      return;
    }
    const ok = await startFlutterwavePayment({
      mode: "session",
      session: sessionPayload,
      onError,
    });
    if (ok) {
      setBookingSheet((prev) => ({ ...prev, open: false, loading: false }));
    } else {
      setBookingSheet((prev) => ({ ...prev, loading: false }));
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
    setPaymentState((prev) => ({ ...prev, submitting: true }));
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
          submitting: false,
          status: `Submission failed (HTTP ${res.status}).`,
        }));
        return;
      }
      setPaymentState((prev) => ({
        ...prev,
        submitting: false,
        status: "Payment submitted ✅ Await admin approval.",
      }));
    } catch {
      setPaymentState((prev) => ({
        ...prev,
        submitting: false,
        status: "Submission failed. Try again.",
      }));
    }
  };

  const handleClientNext = async () => {
    if (clientStep === 1 && !clientForm.displayName) {
      setClientStatus("Add a display name to continue.");
      return;
    }
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
      setClientLoading(true);
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
          let errorMsg = "Registration failed. Please check your details.";
          try {
            const payload = await res.json();
            if (payload?.error === "username_taken") {
              errorMsg = "That username is taken. Choose another.";
            } else if (payload?.error === "missing_display_name") {
              errorMsg = "Add a display name to continue.";
            } else if (payload?.error) {
              errorMsg = `Registration failed: ${payload.error}`;
            }
          } catch {
            // ignore parse errors
          }
          setClientStatus(errorMsg);
          return;
        }
        setRoleLocked(true);
        setLockedRole("client");
        setRole("client");
        if (typeof window !== "undefined") {
          window.localStorage.setItem("vr_role", "client");
          window.localStorage.setItem("vr_role_locked", "1");
        }
      } catch {
        setClientStatus("Registration failed. Please try again.");
        return;
      } finally {
        setClientLoading(false);
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
    if (modelForm.videoFile && modelForm.videoFile.size > 50 * 1024 * 1024) {
      setModelStatus("Verification video must be under 50MB.");
      return;
    }
    const ageCheck = isAdult(modelForm.birthYear, modelForm.birthMonth);
    if (!ageCheck.ok) {
      setModelStatus(ageCheck.message);
      return;
    }
    setVerificationLoading(true);
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
      const uploadRes = await uploadToSignedUrl(uploadPayload.signed_url, modelForm.videoFile);
      if (!uploadRes || !uploadRes.ok) {
        const status = uploadRes?.status || "network";
        setModelStatus(`Upload failed (${status}).`);
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
    } finally {
      setVerificationLoading(false);
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
    const unlockPriceNumber =
      contentForm.unlockPrice === "" ? 0 : Number(contentForm.unlockPrice);
    if (unlockPriceNumber > 0 && !contentForm.fullFile) {
      setContentStatus("Upload the full content for paid unlocks.");
      return;
    }
    setContentSubmitting(true);
    try {
      setContentStatus("Preparing upload…");
      const uploadInit = await fetch("/api/content/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          filename: contentForm.mediaFile.name,
          kind: "teaser",
        }),
      });
      if (!uploadInit.ok) {
        setContentStatus("Unable to start upload. Try again.");
        return;
      }
      const uploadPayload = await uploadInit.json();
      if (!uploadPayload?.signed_url || !uploadPayload?.path) {
        setContentStatus("Upload link missing. Try again.");
        return;
      }
      const uploadRes = await uploadToSignedUrl(uploadPayload.signed_url, contentForm.mediaFile);
      if (!uploadRes || !uploadRes.ok) {
        const status = uploadRes?.status || "network";
        setContentStatus(`Upload failed (${status}).`);
        return;
      }
      let fullPath = "";
      if (unlockPriceNumber > 0 && contentForm.fullFile) {
        const fullInit = await fetch("/api/content/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData,
            filename: contentForm.fullFile.name,
            kind: "full",
          }),
        });
        if (!fullInit.ok) {
          setContentStatus("Unable to start full upload. Try again.");
          return;
        }
        const fullPayload = await fullInit.json();
        if (!fullPayload?.signed_url || !fullPayload?.path) {
          setContentStatus("Full upload link missing. Try again.");
          return;
        }
        const fullRes = await uploadToSignedUrl(fullPayload.signed_url, contentForm.fullFile);
        if (!fullRes || !fullRes.ok) {
          const status = fullRes?.status || "network";
          setContentStatus(`Full upload failed (${status}).`);
          return;
        }
        fullPath = fullPayload.path;
      }
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          title: contentForm.title,
          description: contentForm.description,
          price: unlockPriceNumber > 0 ? unlockPriceNumber : "",
          content_type: contentForm.contentType,
          preview_path: uploadPayload.path,
          full_path: fullPath || undefined,
        }),
      });
      if (!res.ok) {
        let detail = `Content submission failed (HTTP ${res.status}).`;
        try {
          const payload = await res.json();
          if (payload?.error) {
            detail = `${detail} ${payload.error}`;
          }
        } catch {
          // ignore parse errors
        }
        setContentStatus(detail);
        return;
      }
    } catch {
      setContentStatus("Content submission failed.");
      return;
    } finally {
      setContentSubmitting(false);
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
      fullFile: null,
      fullName: "",
    });
  };

  if (booting) {
    return (
      <main className="app-shell">
        <div className="loading-card">
          <div className="brand">
            <span className="brand-dot" />
            <span className="logo-text">Velvet Rooms</span>
          </div>
          <div className="spinner" />
          <p className="helper">Loading your dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <span className="brand-dot" />
          <span className="logo-text">Velvet Rooms</span>
        </div>
        {!roleLocked && (
          <div className="top-actions">
            <button className={`ghost ${role === "client" ? "active" : ""}`} onClick={() => handleRole("client")}>
              Client
            </button>
            <button className={`ghost ${role === "model" ? "active" : ""}`} onClick={() => handleRole("model")}>
              Model
            </button>
          </div>
        )}
        {roleLocked && lockedRole && (
          <div className="top-actions">
            <span className="pill">Account: {lockedRole === "model" ? "Model" : "Client"}</span>
          </div>
        )}
      </header>

      {roleStatus && (
        <section className="banner">
          <strong>{roleStatus}</strong>
        </section>
      )}

      {!role && !roleLocked && contentId && (
        <section className="banner">
          <strong>Content selected:</strong> #{contentId} — continue to purchase.
        </section>
      )}
      {!role && !roleLocked && modelId && (
        <section className="banner">
          <strong>Model selected:</strong> {modelId} — continue to book a session.
        </section>
      )}

      {!role && !roleLocked && (
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

      {!role && !roleLocked && (
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
              <p className="eyebrow">
                {clientAccessPaid ? "Client Dashboard" : "Client Onboarding"}
              </p>
              <h2>
                {clientAccessPaid ? "Welcome to the content gallery." : "Unlock the content gallery."}
              </h2>
            </div>
            {!clientAccessPaid && (
              <div className="stepper">
                <span className={clientStep >= 1 ? "step active" : "step"}>1</span>
                <span className={clientStep >= 2 ? "step active" : "step"}>2</span>
                <span className={clientStep >= 3 ? "step active" : "step"}>3</span>
              </div>
            )}
            {!roleLocked && (
              <button type="button" className="cta ghost" onClick={goToRolePicker}>
                Back
              </button>
            )}
          </header>
          <div className="flow-body">
            {profile?.user && (
              <div className="flow-card">
                <h3>Welcome, {profile.user.username || profile.user.public_id || "Client"}</h3>
                <div className="line">
                  <span>Access status</span>
                  <strong>{clientAccessPaid ? "Unlocked" : "Pending approval"}</strong>
                </div>
                <div className="line">
                  <span>Account type</span>
                  <strong>Client</strong>
                </div>
              </div>
            )}
            {!clientAccessPaid && (
              <>
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
                    {!roleLocked && (
                      <button type="button" className="cta ghost" onClick={goToRolePicker}>
                        Back
                      </button>
                    )}
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
                    <label className="field">
                      Payment method
                      <select
                        value={accessPaymentMethod}
                        onChange={(event) => setAccessPaymentMethod(event.target.value)}
                      >
                        <option value="flutterwave">Flutterwave</option>
                        <option value="crypto">Crypto (BTC/USDT)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() =>
                        accessPaymentMethod === "crypto"
                          ? startCryptoPayment({ mode: "access" })
                          : startFlutterwavePayment({ mode: "access" })
                      }
                    >
                      Continue to payment
                    </button>
                    <button type="button" className="cta ghost" onClick={refreshClientAccess}>
                      I already paid
                    </button>
                    <button
                      type="button"
                      className="cta ghost"
                      onClick={() => setClientStep(1)}
                    >
                      Back
                    </button>
                    {paymentState.status && paymentState.mode === "access" && (
                      <p className="helper">{paymentState.status}</p>
                    )}
                  </div>
                )}
              </>
            )}
            {clientAccessPaid && (
              <>
                <div className="dash-actions">
                  <button
                    type="button"
                    className={`cta ${clientTab === "gallery" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("gallery")}
                  >
                    Gallery
                  </button>
                  <button
                    type="button"
                    className={`cta ${clientTab === "profile" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("profile")}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`cta ${clientTab === "purchases" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("purchases")}
                  >
                    Purchases
                  </button>
                  <button
                    type="button"
                    className={`cta ${clientTab === "sessions" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("sessions")}
                  >
                    Sessions
                  </button>
                  <button
                    type="button"
                    className={`cta ${clientTab === "wallet" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("wallet")}
                  >
                    Wallet
                  </button>
                </div>

                {clientTab === "gallery" && (
                  <div className="flow-card">
                    <h3>Content Gallery</h3>
                    <p>Browse verified creators, buy content, or book a session.</p>
                    {galleryJoinStatus.checked && !galleryJoinStatus.joined && (
                      <div className="notice-card">
                        <p className="helper">
                          Join the gallery channel to receive verified teaser posts.
                        </p>
                        <div className="gallery-actions">
                          <button
                            type="button"
                            className="cta primary"
                            onClick={requestGalleryInvite}
                          >
                            Join gallery
                          </button>
                          <button
                            type="button"
                            className="cta ghost"
                            onClick={checkGalleryMembership}
                          >
                            I joined
                          </button>
                        </div>
                        {galleryInviteLink && (
                          <p className="helper">Invite link: {galleryInviteLink}</p>
                        )}
                      </div>
                    )}
                    {galleryJoinStatus.checked && galleryJoinStatus.joined && (
                      <p className="helper">Gallery channel connected ✅</p>
                    )}
                    {galleryJoinError && <p className="helper error">{galleryJoinError}</p>}
                    {galleryLoading && <p className="helper">Loading gallery…</p>}
                    {galleryStatus && <p className="helper error">{galleryStatus}</p>}
                    {galleryStatus && (
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={refreshGalleryAccess}
                      >
                        Refresh access
                      </button>
                    )}
                    {!galleryStatus && !galleryLoading && galleryItems.length === 0 && (
                      <p className="helper">No approved teasers yet.</p>
                    )}
                    {!galleryStatus && !galleryLoading && galleryItems.length > 0 && (
                      <div className="gallery-grid" id="client-gallery">
                        {galleryItems.map((item) => (
                          <div key={`gallery-${item.id}`} className="gallery-card">
                            <div className="gallery-media">
                              <div className="media-fallback">Tap to view</div>
                            </div>
                            <div className="gallery-body">
                              <div>
                                <h4>{item.title}</h4>
                                <p>{item.description || "Exclusive teaser content."}</p>
                              </div>
                              <div className="gallery-meta">
                                <span>{item.display_name || item.public_id}</span>
                                <span>{item.content_type}</span>
                              </div>
                              <div className="gallery-actions">
                                <button
                                  type="button"
                                  className="cta primary"
                                  onClick={() => openPreview(item)}
                                >
                                  View once
                                </button>
                                <button
                                  type="button"
                                  className={`cta ghost ${item.is_following ? "active" : ""} ${
                                    followState[item.model_id]?.loading ? "loading" : ""
                                  }`}
                                  onClick={() => toggleFollow(item.model_id)}
                                  disabled={followState[item.model_id]?.loading}
                                >
                                  {item.is_following ? "Following" : "Follow"}
                                </button>
                                {item.price ? (
                                  <>
                                    <label className="field">
                                      Payment method
                                      <select
                                        value={contentPaymentMethod[item.id] || "flutterwave"}
                                        onChange={(event) =>
                                          setContentPaymentMethod((prev) => ({
                                            ...prev,
                                            [item.id]: event.target.value,
                                          }))
                                        }
                                      >
                                        <option value="flutterwave">Flutterwave</option>
                                        <option value="crypto">Crypto (BTC/USDT)</option>
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      className="cta primary alt"
                                      onClick={() => {
                                        const method =
                                          contentPaymentMethod[item.id] || "flutterwave";
                                        if (method === "crypto") {
                                          startCryptoPayment({
                                            mode: "content",
                                            contentId: item.id,
                                          });
                                        } else {
                                          startFlutterwavePayment({
                                            mode: "content",
                                            contentId: item.id,
                                          });
                                        }
                                      }}
                                    >
                                      Pay {`₦${item.price}`}
                                    </button>
                                  </>
                                ) : (
                                  <span className="pill">Teaser</span>
                                )}
                                <button
                                  type="button"
                                  className="cta ghost"
                                  onClick={() => openBooking(item)}
                                >
                                  Book session
                                </button>
                              </div>
                              {followState[item.model_id]?.error && (
                                <p className="helper error">
                                  {followState[item.model_id]?.error}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {clientTab === "profile" && (
                  <div className="flow-card">
                    <h3>Your Profile</h3>
                    <div className="avatar-row">
                      <div className="avatar">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Profile" />
                        ) : (
                          <span>{(profile?.user?.username || "C")[0]}</span>
                        )}
                      </div>
                      <div className="avatar-actions">
                        <label className="field file">
                          Upload photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setAvatarState((prev) => ({
                                ...prev,
                                name: event.target.files?.[0]?.name || "",
                                file: event.target.files?.[0] || null,
                                status: "",
                              }))
                            }
                          />
                          <span className="file-name">
                            {avatarState.name || "No file selected"}
                          </span>
                        </label>
                        <button
                          type="button"
                          className={`cta primary alt ${avatarState.uploading ? "loading" : ""}`}
                          onClick={submitAvatar}
                          disabled={avatarState.uploading}
                        >
                          Save photo
                        </button>
                        {avatarState.status && <p className="helper">{avatarState.status}</p>}
                      </div>
                    </div>
                    <div className="line">
                      <span>Username</span>
                      <strong>{profile?.user?.username || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Email</span>
                      <strong>{profile?.user?.email || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Joined</span>
                      <strong>{profile?.user?.created_at || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Access status</span>
                      <strong>{clientAccessPaid ? "Unlocked" : "Pending"}</strong>
                    </div>
                    <div className="line">
                      <span>Followers</span>
                      <strong>{profile?.user?.followers_count || 0}</strong>
                    </div>
                    <div className="line">
                      <span>Following</span>
                      <strong>{profile?.user?.following_count || 0}</strong>
                    </div>
                    <button type="button" className="cta primary alt" onClick={deleteClientAccount}>
                      Delete account
                    </button>
                    {clientDeleteStatus && <p className="helper error">{clientDeleteStatus}</p>}
                  </div>
                )}

                {clientTab === "purchases" && (
                  <div className="flow-card">
                    <h3>Your Purchases</h3>
                    {clientPurchasesStatus && (
                      <p className="helper error">{clientPurchasesStatus}</p>
                    )}
                    {clientPurchasesLoading && <p className="helper">Loading purchases…</p>}
                    {!clientPurchasesStatus && !clientPurchasesLoading && clientPurchases.length === 0 && (
                      <p className="helper">No purchases yet.</p>
                    )}
                    {!clientPurchasesLoading && clientPurchases.map((item) => (
                      <div key={`purchase-${item.id}`} className="list-row">
                        <div>
                          <strong>{item.title || "Session"}</strong>
                          <p className="muted">
                            {item.display_name || item.public_id} · {item.content_type}
                          </p>
                        </div>
                        <span className={`pill ${getStatusTone(item.status)}`}>
                          {item.item_type === "session"
                            ? "Session completed"
                            : item.status === "rejected"
                            ? "Rejected by admin"
                            : item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {clientTab === "sessions" && (
                  <div className="flow-card">
                    <h3>Your Sessions</h3>
                    {clientSessionsStatus && (
                      <p className="helper error">{clientSessionsStatus}</p>
                    )}
                    {clientSessionsLoading && <p className="helper">Loading sessions…</p>}
                    {!clientSessionsStatus && !clientSessionsLoading && clientSessions.length === 0 && (
                      <p className="helper">No sessions yet.</p>
                    )}
                    {!clientSessionsLoading && clientSessions.map((item) => (
                      <div key={`session-${item.id}`} className="list-row">
                        <div>
                          <strong>{item.model_label || "Model"}</strong>
                          <p className="muted">
                            {item.session_type} · {item.duration_minutes} min
                          </p>
                        </div>
                        <div className="session-actions">
                          <span className={`pill ${getStatusTone(item.status)}`}>
                            {formatSessionStatus(item.status)}
                          </span>
                          {["accepted", "active"].includes(item.status) && (
                            <button
                              type="button"
                              className={`cta ghost ${
                                sessionActionStatus[item.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() => handleSessionJoin(item.id)}
                              disabled={sessionActionStatus[item.id]?.loading}
                            >
                              Start session
                            </button>
                          )}
                          {item.status === "active" &&
                            ["video", "voice"].includes(item.session_type) && (
                              <button
                                type="button"
                                className="cta primary alt"
                                onClick={() => openExtension(item)}
                              >
                                Extend 5 min
                              </button>
                            )}
                          {item.status === "awaiting_confirmation" && (
                            <button
                              type="button"
                              className={`cta ghost ${
                                sessionActionStatus[item.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() => handleSessionConfirm(item.id)}
                              disabled={sessionActionStatus[item.id]?.loading}
                            >
                              Confirm completed
                            </button>
                          )}
                          {["pending_payment", "pending", "accepted", "active"].includes(
                            item.status
                          ) && (
                            <button
                              type="button"
                              className={`cta danger ${
                                sessionActionStatus[item.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() => handleSessionCancel(item.id)}
                              disabled={sessionActionStatus[item.id]?.loading}
                            >
                              Cancel
                            </button>
                          )}
                          {["active", "awaiting_confirmation"].includes(item.status) && (
                            <button
                              type="button"
                              className={`cta ghost ${
                                sessionActionStatus[item.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() =>
                                setDisputeState({
                                  open: true,
                                  sessionId: item.id,
                                  reason: "",
                                  status: "",
                                  loading: false,
                                })
                              }
                              disabled={sessionActionStatus[item.id]?.loading}
                            >
                              Dispute
                            </button>
                          )}
                        </div>
                        {sessionActionStatus[item.id]?.error && (
                          <p className="helper error">
                            {sessionActionStatus[item.id]?.error}
                          </p>
                        )}
                        {sessionActionStatus[item.id]?.info && (
                          <p className="helper">
                            {sessionActionStatus[item.id]?.info}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {clientTab === "wallet" && (
                  <div className="flow-card">
                    <h3>Wallet</h3>
                    <div className="line">
                      <span>Balance</span>
                      <strong>
                        ₦{Number(profile?.user?.wallet_balance || 0).toLocaleString()}
                      </strong>
                    </div>
                    <p className="helper">
                      Escrow payments and releases appear here once completed.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {clientStatus && <p className="helper error">{clientStatus}</p>}
          {clientStep === 1 && !clientAccessPaid && (
            <button
              type="button"
              className={`cta primary ${clientLoading ? "loading" : ""}`}
              onClick={handleClientNext}
              disabled={clientLoading}
            >
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
              <h3>Crypto payment (BTC / USDT)</h3>
              <button
                type="button"
                className="cta ghost"
                onClick={() =>
                  setPaymentState((prev) => ({
                    ...prev,
                    open: false,
                    status: "",
                    submitting: false,
                  }))
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
            <button
              type="button"
              className={`cta primary ${paymentState.submitting ? "loading" : ""}`}
              onClick={submitCryptoPayment}
              disabled={paymentState.submitting}
            >
              Submit payment
            </button>
          </div>
        </section>
      )}

      {disputeState.open && (
        <section className="payment-sheet">
          <div className="payment-card">
            <header>
              <h3>Open a dispute</h3>
              <button
                type="button"
                className="cta ghost"
                onClick={() =>
                  setDisputeState({
                    open: false,
                    sessionId: null,
                    reason: "",
                    status: "",
                    loading: false,
                  })
                }
              >
                Close
              </button>
            </header>
            <p className="helper">
              Tell us what went wrong. Admin will review and contact both parties.
            </p>
            <label className="field">
              Dispute reason
              <textarea
                rows={4}
                value={disputeState.reason}
                onChange={(event) =>
                  setDisputeState((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Describe the issue..."
              />
            </label>
            {disputeState.status && <p className="helper error">{disputeState.status}</p>}
            <button
              type="button"
              className={`cta primary ${disputeState.loading ? "loading" : ""}`}
              onClick={submitDispute}
              disabled={disputeState.loading}
            >
              Submit dispute
            </button>
          </div>
        </section>
      )}

      {previewOverlay.open && previewOverlay.item && (
        <section className="preview-overlay" onClick={closePreview}>
          <div className="preview-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">View once</p>
                <h3>{previewOverlay.item.title}</h3>
              </div>
              <button type="button" className="cta ghost" onClick={closePreview}>
                Close
              </button>
            </header>
            <p className="helper">
              Closing in {previewOverlay.remaining}s
            </p>
            <div className="preview-media">
              {previewOverlay.item.content_type === "video" ? (
                <video
                  src={previewOverlay.item.preview_url}
                  autoPlay
                  playsInline
                  controls
                />
              ) : (
                <img src={previewOverlay.item.preview_url} alt={previewOverlay.item.title} />
              )}
            </div>
          </div>
        </section>
      )}

      {bookingSheet.open && (
        <section className="payment-sheet">
          <div className="payment-card">
            <header>
              <h3>Book a session</h3>
              <button
                type="button"
                className="cta ghost"
                onClick={() => setBookingSheet((prev) => ({ ...prev, open: false }))}
              >
                Close
              </button>
            </header>
            <p className="helper">
              Booking with {bookingSheet.modelName}. Select a session package to continue.
            </p>
            <div className="field-row">
              <label className="field">
                Session type
                <select
                  value={bookingSheet.sessionType}
                  onChange={(event) =>
                    setBookingSheet((prev) => ({
                      ...prev,
                      sessionType: event.target.value,
                    }))
                  }
                >
                  <option value="chat">Private chat</option>
                  <option value="voice">Voice call</option>
                  <option value="video">Video call</option>
                </select>
              </label>
              <label className="field">
                Duration
                <select
                  value={bookingSheet.duration}
                  onChange={(event) =>
                    setBookingSheet((prev) => ({
                      ...prev,
                      duration: Number(event.target.value),
                    }))
                  }
                >
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                </select>
              </label>
            </div>
            <label className="field">
              Schedule (within 24h)
              <input
                type="datetime-local"
                value={bookingSheet.scheduledFor}
                min={scheduleMin}
                max={scheduleMax}
                step="3600"
                onChange={(event) =>
                  setBookingSheet((prev) => ({ ...prev, scheduledFor: event.target.value }))
                }
              />
            </label>
            <div className="wallet-box">
              <span>Session fee</span>
              <strong>₦{bookingSheet.price || "-"}</strong>
            </div>
            <label className="field">
              Payment method
              <select
                value={bookingSheet.paymentMethod}
                onChange={(event) =>
                  setBookingSheet((prev) => ({ ...prev, paymentMethod: event.target.value }))
                }
              >
                <option value="flutterwave">Flutterwave</option>
                <option value="crypto">Crypto (BTC/USDT)</option>
              </select>
            </label>
            {bookingSheet.status && <p className="helper">{bookingSheet.status}</p>}
            <button
              type="button"
              className={`cta primary ${bookingSheet.loading ? "loading" : ""}`}
              onClick={submitBookingPayment}
              disabled={bookingSheet.loading}
            >
              Proceed to payment
            </button>
          </div>
        </section>
      )}

      {extensionSheet.open && (
        <section className="payment-sheet">
          <div className="payment-card">
            <header>
              <h3>Extend session</h3>
              <button
                type="button"
                className="cta ghost"
                onClick={() => setExtensionSheet((prev) => ({ ...prev, open: false }))}
              >
                Close
              </button>
            </header>
            <p className="helper">
              Extend this {extensionSheet.sessionType} session by {extensionSheet.minutes} minutes.
            </p>
            <div className="wallet-box">
              <span>Extension fee</span>
              <strong>₦{extensionSheet.price || "-"}</strong>
            </div>
            <label className="field">
              Payment method
              <select
                value={extensionSheet.paymentMethod}
                onChange={(event) =>
                  setExtensionSheet((prev) => ({
                    ...prev,
                    paymentMethod: event.target.value,
                  }))
                }
              >
                <option value="flutterwave">Flutterwave</option>
                <option value="crypto">Crypto (BTC/USDT)</option>
              </select>
            </label>
            {extensionSheet.status && <p className="helper">{extensionSheet.status}</p>}
            <button
              type="button"
              className={`cta primary ${extensionSheet.loading ? "loading" : ""}`}
              onClick={submitExtensionPayment}
              disabled={extensionSheet.loading}
            >
              Pay &amp; extend
            </button>
          </div>
        </section>
      )}

      {role === "model" && (
      <section className="flow-grid">
        <article className="flow-panel" id="model-flow">
          <header className="flow-head">
            <div>
              <p className="eyebrow">
                {modelApproved ? "Model Dashboard" : "Model Onboarding"}
              </p>
              <h2>
                {modelApproved
                  ? `Welcome back, ${profile?.model?.display_name || modelForm.stageName || "Model"}.`
                  : "Get verified to sell content and sessions."}
              </h2>
            </div>
            {!modelApproved && (
              <div className="stepper">
                <span className={modelStep >= 1 ? "step active" : "step"}>1</span>
                <span className={modelStep >= 2 ? "step active" : "step"}>2</span>
                <span className={modelStep >= 3 ? "step active" : "step"}>3</span>
              </div>
            )}
            {!roleLocked && (
              <button type="button" className="cta ghost" onClick={goToRolePicker}>
                Back
              </button>
            )}
          </header>
          <div className="flow-body">
            {modelApproved ? (
              <>
                <div className="dash-actions">
                  <button
                    type="button"
                    className={`cta ${modelTab === "profile" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("profile")}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "content" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("content")}
                  >
                    Content
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "sessions" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("sessions")}
                  >
                    Sessions
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "earnings" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("earnings")}
                  >
                    Earnings
                  </button>
                </div>

                {modelTab === "profile" && (
                  <div className="flow-card">
                    <h3>Profile</h3>
                    <div className="avatar-row">
                      <div className="avatar">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Profile" />
                        ) : (
                          <span>{(profile?.model?.display_name || "M")[0]}</span>
                        )}
                      </div>
                      <div className="avatar-actions">
                        <label className="field file">
                          Upload photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setAvatarState((prev) => ({
                                ...prev,
                                name: event.target.files?.[0]?.name || "",
                                file: event.target.files?.[0] || null,
                                status: "",
                              }))
                            }
                          />
                          <span className="file-name">
                            {avatarState.name || "No file selected"}
                          </span>
                        </label>
                        <button
                          type="button"
                          className={`cta primary alt ${avatarState.uploading ? "loading" : ""}`}
                          onClick={submitAvatar}
                          disabled={avatarState.uploading}
                        >
                          Save photo
                        </button>
                        {avatarState.status && <p className="helper">{avatarState.status}</p>}
                      </div>
                    </div>
                    <div className="line">
                      <span>Display name</span>
                      <strong>{profile?.model?.display_name || modelForm.stageName || "Model"}</strong>
                    </div>
                    <div className="line">
                      <span>Email</span>
                      <strong>{profile?.user?.email || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Verification</span>
                      <strong>Approved</strong>
                    </div>
                    <div className="line">
                      <span>Account type</span>
                      <strong>Model</strong>
                    </div>
                    <div className="line">
                      <span>Total teasers</span>
                      <strong>{modelItems.length}</strong>
                    </div>
                    <div className="line">
                      <span>Approved teasers</span>
                      <strong>{modelItems.filter((item) => item.is_active).length}</strong>
                    </div>
                    <div className="line">
                      <span>Pending teasers</span>
                      <strong>{modelItems.filter((item) => !item.is_active).length}</strong>
                    </div>
                    <div className="line">
                      <span>Followers</span>
                      <strong>{profile?.user?.followers_count || 0}</strong>
                    </div>
                    <div className="line">
                      <span>Following</span>
                      <strong>{profile?.user?.following_count || 0}</strong>
                    </div>
                  </div>
                )}

                {modelTab === "content" && (
                  <div className="flow-card">
                    <h3>Creator Gallery</h3>
                    <p className="helper">
                      Teasers appear in the public gallery after admin approval.
                    </p>
                    <div className="dash-actions">
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={() => setContentRefreshKey((prev) => prev + 1)}
                      >
                        Refresh list
                      </button>
                      <button
                        type="button"
                        className="cta primary alt"
                        onClick={() => setShowContentForm((prev) => !prev)}
                      >
                        {showContentForm ? "Hide content form" : "Add content"}
                      </button>
                      <button
                        type="button"
                        className={`cta ${modelContentFilter === "all" ? "primary" : "ghost"}`}
                        onClick={() => setModelContentFilter("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`cta ${modelContentFilter === "approved" ? "primary" : "ghost"}`}
                        onClick={() => setModelContentFilter("approved")}
                      >
                        Approved
                      </button>
                      <button
                        type="button"
                        className={`cta ${modelContentFilter === "pending" ? "primary" : "ghost"}`}
                        onClick={() => setModelContentFilter("pending")}
                      >
                        Pending
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
                                setContentForm((prev) => ({
                                  ...prev,
                                  contentType: event.target.value,
                                }))
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
                                setContentForm((prev) => ({
                                  ...prev,
                                  unlockPrice: event.target.value,
                                }))
                              }
                              placeholder="₦ 0"
                            />
                          </label>
                        </div>
                        {Number(contentForm.unlockPrice || 0) > 0 && (
                          <label className="field file">
                            Full content (required for paid unlocks)
                            <input
                              type="file"
                              accept="image/*,video/*"
                              onChange={(event) =>
                                setContentForm((prev) => ({
                                  ...prev,
                                  fullName: event.target.files?.[0]?.name || "",
                                  fullFile: event.target.files?.[0] || null,
                                }))
                              }
                            />
                            <span className="file-name">
                              {contentForm.fullName || "No file selected"}
                            </span>
                          </label>
                        )}
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
                        <button
                          type="button"
                          className={`cta primary alt ${contentSubmitting ? "loading" : ""}`}
                          onClick={submitContent}
                          disabled={contentSubmitting}
                        >
                          Submit teaser
                        </button>
                      </div>
                    )}
                    <div className="content-list">
                      <h4>Your teasers</h4>
                      {modelItemsStatus && <p className="helper error">{modelItemsStatus}</p>}
                      {!modelItemsStatus && filteredModelItems.length === 0 && (
                        <p className="helper">No teasers yet.</p>
                      )}
                      {!modelItemsStatus && filteredModelItems.length > 0 && (
                        <div className="gallery-grid">
                          {filteredModelItems.map((item) => (
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
                  </div>
                )}

                {modelTab === "sessions" && (
                  <div className="flow-card">
                    <h3>My Bookings</h3>
                    {myBookingsStatus && <p className="helper error">{myBookingsStatus}</p>}
                    {myBookingsLoading && <p className="helper">Loading bookings…</p>}
                    {!myBookingsStatus && !myBookingsLoading && myBookings.length === 0 && (
                      <p className="helper">No bookings yet.</p>
                    )}
                    {!myBookingsStatus && !myBookingsLoading && myBookings.length > 0 && (
                      <div className="gallery-grid">
                        {myBookings.map((item) => (
                          <div key={`booking-${item.id}`} className="gallery-card">
                              <div className="gallery-body">
                                <h4>{item.session_type || "Session"}</h4>
                              <span className={`pill ${getStatusTone(item.status)}`}>
                                {formatSessionStatus(item.status || "pending")}
                              </span>
                                <div className="gallery-meta">
                                  <span>{item.client_label || "Client"}</span>
                                  <strong>{item.duration_minutes || "-"} mins</strong>
                                </div>
                              {item.status === "pending" && (
                                <div className="gallery-actions">
                                  <button
                                    type="button"
                                    className={`cta primary ${
                                      bookingActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    disabled={bookingActionStatus[item.id]?.loading}
                                    onClick={() => handleBookingAction(item.id, "accept")}
                                  >
                                    Accept booking
                                  </button>
                                  <button
                                    type="button"
                                    className={`cta ghost ${
                                      bookingActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    disabled={bookingActionStatus[item.id]?.loading}
                                    onClick={() => handleBookingAction(item.id, "decline")}
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                              {["accepted", "active"].includes(item.status) && (
                                <div className="gallery-actions">
                                  <button
                                    type="button"
                                    className={`cta ghost ${
                                      sessionActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    onClick={() => handleSessionJoin(item.id)}
                                    disabled={sessionActionStatus[item.id]?.loading}
                                  >
                                    Start session
                                  </button>
                                  <button
                                    type="button"
                                    className={`cta danger ${
                                      bookingActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    onClick={() => handleBookingAction(item.id, "cancel")}
                                    disabled={bookingActionStatus[item.id]?.loading}
                                  >
                                    Cancel session
                                  </button>
                                </div>
                              )}
                              {item.status === "awaiting_confirmation" && (
                                <div className="gallery-actions">
                                  <button
                                    type="button"
                                    className={`cta ghost ${
                                      sessionActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    onClick={() => handleSessionConfirm(item.id)}
                                    disabled={sessionActionStatus[item.id]?.loading}
                                  >
                                    Confirm completed
                                  </button>
                                </div>
                              )}
                              {bookingActionStatus[item.id]?.error && (
                                <p className="helper error">
                                  {bookingActionStatus[item.id]?.error}
                                </p>
                              )}
                              {bookingActionStatus[item.id]?.info && (
                                <p className="helper">
                                  {bookingActionStatus[item.id]?.info}
                                </p>
                              )}
                              {sessionActionStatus[item.id]?.error && (
                                <p className="helper error">
                                  {sessionActionStatus[item.id]?.error}
                                </p>
                              )}
                              {sessionActionStatus[item.id]?.info && (
                                <p className="helper">
                                  {sessionActionStatus[item.id]?.info}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {modelTab === "earnings" && (
                  <div className="flow-card">
                    <h3>Earnings</h3>
                    {modelEarningsStatus && (
                      <p className="helper error">{modelEarningsStatus}</p>
                    )}
                    {!modelEarningsStatus && !modelEarnings && (
                      <p className="helper">No earnings data yet.</p>
                    )}
                    {modelEarnings && (
                      <>
                        <div className="line">
                          <span>Total released</span>
                          <strong>
                            ₦{Number(modelEarnings.payouts?.total_released || 0).toLocaleString()}
                          </strong>
                        </div>
                        <div className="line">
                          <span>Pending payout</span>
                          <strong>
                            ₦{Number(modelEarnings.payouts?.pending_payout || 0).toLocaleString()}
                          </strong>
                        </div>
                        <div className="line">
                          <span>Released (7 days)</span>
                          <strong>
                            ₦{Number(modelEarnings.payouts?.released_7d || 0).toLocaleString()}
                          </strong>
                        </div>
                        <div className="line">
                          <span>Total sessions</span>
                          <strong>{modelEarnings.sessions?.total || 0}</strong>
                        </div>
                        <div className="line">
                          <span>Completed sessions</span>
                          <strong>{modelEarnings.sessions?.completed || 0}</strong>
                        </div>
                        <div className="line">
                          <span>Active sessions</span>
                          <strong>{modelEarnings.sessions?.active || 0}</strong>
                        </div>
                        <div className="line">
                          <span>Total content</span>
                          <strong>{modelEarnings.content?.total || 0}</strong>
                        </div>
                        <div className="line">
                          <span>Approved content</span>
                          <strong>{modelEarnings.content?.approved || 0}</strong>
                        </div>
                        <div className="line">
                          <span>Pending content</span>
                          <strong>{modelEarnings.content?.pending || 0}</strong>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {profile?.user && (
                  <div className="flow-card">
                    <h3>Welcome, {profile.model?.display_name || "Model"}</h3>
                    <div className="line">
                      <span>Status</span>
                      <strong>{profile.model?.verification_status || "Pending"}</strong>
                    </div>
                    <div className="line">
                      <span>Account type</span>
                      <strong>Model</strong>
                    </div>
                  </div>
                )}
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
                    <button
                      type="button"
                      className="cta ghost"
                      onClick={() => setModelStep(1)}
                    >
                      Back
                    </button>
                  </div>
                )}
                {modelStep === 3 && (
                  <div className="flow-card">
                    <h3>Awaiting Approval</h3>
                    <p>Your verification is in review. You will be notified once approved.</p>
                    <div className="dash-actions">
                      <button type="button" className="cta ghost" onClick={refreshModelStatus}>
                        Check status
                      </button>
                      <button type="button" className="cta ghost" disabled>
                        Dashboard unlocks after approval
                      </button>
                    </div>
                  </div>
                )}
              </>
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
            <button
              type="button"
              className={`cta primary alt ${verificationLoading ? "loading" : ""}`}
              onClick={submitModelVerification}
              disabled={verificationLoading}
            >
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
