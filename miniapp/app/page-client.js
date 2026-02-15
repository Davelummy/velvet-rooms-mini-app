"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  EmptyState,
  ErrorState,
  NotificationPriorityBadge,
  StatusPill,
  SyncIndicator,
} from "./_components/ui-kit";

const DISCLAIMER_VERSION = "2026-01-31";
const AGE_GATE_STORAGE_KEY = "vr_age_confirmed";
const ONBOARDING_VERSION = "2026-02-10";
const ONBOARDING_STORAGE_KEY = "vr_onboarding_seen";
const CLIENT_DRAFT_KEY = "vr_client_draft_v1";
const MODEL_DRAFT_KEY = "vr_model_draft_v1";
const AVATAR_CROP_SIZE = 220;
const GALLERY_PAGE_SIZE = 18;
const SESSIONS_PAGE_SIZE = 20;
const CALL_REACTION_OPTIONS = ["❤️", "🔥", "😍", "👏", "😂", "💫"];

export default function Home() {
  const cleanTagLabel = (value) => {
    if (!value) {
      return "";
    }
    let out = value.toString().trim();
    // Strip common quote wrapping that can leak from JSON-ish sources.
    if (out.length >= 2 && ((out[0] === '"' && out[out.length - 1] === '"') || (out[0] === "'" && out[out.length - 1] === "'"))) {
      out = out.slice(1, -1).trim();
    }
    out = out.replace(/^#/, "").trim();
    // Guard against people pasting JSON arrays into tags fields.
    out = out.replace(/^\[/, "").replace(/\]$/, "").trim();
    return out.slice(0, 24);
  };

  const resolveDisplayName = (item, fallback = "User") => {
    if (!item) {
      return fallback;
    }
    return (
      item.display_name ||
      item.client_display_name ||
      item.model_display_name ||
      item.username ||
      item.public_id ||
      fallback
    );
  };

  const generateIdempotencyKey = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const getWalletIdempotencyKey = (mode, session) => {
    const key = `${mode}:${session?.sessionId || session?.modelId || "access"}`;
    if (!walletIdempotencyRef.current[key]) {
      walletIdempotencyRef.current[key] = generateIdempotencyKey();
    }
    return walletIdempotencyRef.current[key];
  };

  const getSessionActionIdempotencyKey = (scope, sessionId) => {
    const key = `${scope}:${sessionId || "na"}`;
    if (!sessionActionIdempotencyRef.current[key]) {
      sessionActionIdempotencyRef.current[key] = generateIdempotencyKey();
    }
    return sessionActionIdempotencyRef.current[key];
  };

  const getPaymentInitIdempotencyKey = ({ mode, contentId, session }) => {
    const key = `${mode || "payment"}:${contentId || "none"}:${
      session?.sessionId || session?.modelId || "none"
    }:${session?.duration || session?.extensionMinutes || "na"}`;
    if (!paymentInitIdempotencyRef.current[key]) {
      paymentInitIdempotencyRef.current[key] = generateIdempotencyKey();
    }
    return paymentInitIdempotencyRef.current[key];
  };

  const [geoLib, setGeoLib] = useState(null);
  useEffect(() => {
    let alive = true;
    import("country-state-city")
      .then((mod) => {
        if (alive) {
          setGeoLib(mod);
        }
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  const countries = useMemo(() => {
    const list = geoLib?.Country?.getAllCountries?.() || [];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [geoLib]);

  const countriesByIso = useMemo(() => {
    const map = new Map();
    for (const country of countries) {
      map.set(country.isoCode, country);
    }
    return map;
  }, [countries]);

  const countriesByName = useMemo(() => {
    const map = new Map();
    for (const country of countries) {
      map.set(country.name.toLowerCase(), country);
    }
    return map;
  }, [countries]);

  const getRegionOptions = (countryIso) => {
    if (!countryIso) {
      return { kind: "region", items: [] };
    }
    const normalizeName = (value) => (value || "").toString().trim();
    const states = geoLib?.State?.getStatesOfCountry?.(countryIso) || [];
    if (states.length) {
      return {
        kind: "state",
        items: states
          .map((state) => normalizeName(state.name))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
      };
    }
    const cities = geoLib?.City?.getCitiesOfCountry?.(countryIso) || [];
    const names = Array.from(
      new Set(cities.map((city) => normalizeName(city.name)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return { kind: "city", items: names };
  };

  const buildLocationValue = (countryIso, regionName) => {
    const countryName = countriesByIso.get(countryIso)?.name || "";
    if (!countryName) {
      return "";
    }
    if (!regionName) {
      return countryName;
    }
    return `${regionName}, ${countryName}`;
  };

  const parseLocation = (value) => {
    const raw = (value || "").toString().trim();
    if (!raw) {
      return { countryIso: "", regionName: "" };
    }
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) {
      return { countryIso: "", regionName: "" };
    }
    const countryName = parts[parts.length - 1];
    const isoGuess = countryName.toUpperCase();
    const country =
      countriesByIso.get(isoGuess) || countriesByName.get(countryName.toLowerCase());
    if (!country) {
      return { countryIso: "", regionName: "" };
    }
    const regionName = parts.slice(0, -1).join(", ");
    return { countryIso: country.isoCode, regionName };
  };

  const supabaseClient = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return null;
    }
    return createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }, []);

  const searchParams = useSearchParams();
  const contentId = searchParams.get("content");
  const modelId = searchParams.get("model_id") || searchParams.get("model");
  const [role, setRole] = useState(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [roleLocked, setRoleLocked] = useState(false);
  const [lockedRole, setLockedRole] = useState(null);
  const [roleStatus, setRoleStatus] = useState("");
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [ageGateConfirmed, setAgeGateConfirmed] = useState(false);
  const [ageGateStatus, setAgeGateStatus] = useState("");
  const [ageGateTargetRole, setAgeGateTargetRole] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
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
    disclaimerAccepted: false,
  });
  const [clientErrors, setClientErrors] = useState({});
  const [clientCountryIso, setClientCountryIso] = useState("");
  const [clientRegionName, setClientRegionName] = useState("");
  const [clientLocationDirty, setClientLocationDirty] = useState(false);
  const [modelForm, setModelForm] = useState({
    stageName: "",
    bio: "",
    email: "",
    location: "",
    birthMonth: "",
    birthYear: "",
    tags: "",
    availability: "",
    videoFile: null,
    videoName: "",
    disclaimerAccepted: false,
  });
  const [modelErrors, setModelErrors] = useState({});
  const [modelCountryIso, setModelCountryIso] = useState("");
  const [modelRegionName, setModelRegionName] = useState("");
  const [modelLocationDirty, setModelLocationDirty] = useState(false);
  const [clientStatus, setClientStatus] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [profile, setProfile] = useState(null);
  const [modelApproved, setModelApproved] = useState(false);
  const [clientAccessPaid, setClientAccessPaid] = useState(false);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryStatus, setGalleryStatus] = useState("");
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState("all");
  const [savedGalleryIds, setSavedGalleryIds] = useState([]);
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
  const [clientSessionsPage, setClientSessionsPage] = useState(0);
  const [clientSessionsHasMore, setClientSessionsHasMore] = useState(false);
  const [clientSessionsLoadingMore, setClientSessionsLoadingMore] = useState(false);
  const [sessionListMode, setSessionListMode] = useState("all");
  const [callState, setCallState] = useState({
    open: false,
    sessionId: null,
    sessionType: "",
    channelName: "",
    status: "",
    connecting: false,
    micMuted: false,
    cameraOff: false,
    peerReady: false,
    audioOnly: false,
    peerLabel: "",
  });
  const [callPreflight, setCallPreflight] = useState({
    open: false,
    mic: "unknown",
    cam: "unknown",
    audioOnly: false,
    checking: false,
  });
  const [callConnectionStatus, setCallConnectionStatus] = useState("idle");
  const [callQuality, setCallQuality] = useState({ label: "Unknown", tone: "neutral" });
  const [callNetworkStatus, setCallNetworkStatus] = useState("online");
  const [callMessages, setCallMessages] = useState([]);
  const [callInput, setCallInput] = useState("");
  const [callReactions, setCallReactions] = useState([]);
  const [callReactionTrayOpen, setCallReactionTrayOpen] = useState(false);
  const [callUnreadCount, setCallUnreadCount] = useState(0);
  const [callChatOpen, setCallChatOpen] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [callTyping, setCallTyping] = useState(false);
  const [callTiming, setCallTiming] = useState({
    startedAt: null,
    endsAt: null,
    durationMinutes: null,
  });
  const [callCountdown, setCallCountdown] = useState({
    remaining: null,
    elapsed: null,
  });
  const [callToast, setCallToast] = useState({ open: false, message: "", tone: "neutral" });
  const [callEndDialog, setCallEndDialog] = useState({
    open: false,
    reason: "",
    note: "",
    status: "",
    sending: false,
  });
  const [callRemoteVideoReady, setCallRemoteVideoReady] = useState(false);
  const [callConclusion, setCallConclusion] = useState({
    open: false,
    title: "",
    body: "",
  });
  const [callRating, setCallRating] = useState({
    value: 0,
    submitted: false,
    status: "",
  });
  const [callTimeOffset, setCallTimeOffset] = useState(0);
  const [notifications, setNotifications] = useState({
    open: false,
    items: [],
    unread: 0,
    loading: false,
    error: "",
  });
  const [syncMarks, setSyncMarks] = useState({});
  const [syncTicker, setSyncTicker] = useState(0);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatLogRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callPcRef = useRef(null);
  const callChannelRef = useRef(null);
  const callChannelSubscribedRef = useRef(false);
  const offerSentRef = useRef(false);
  const callUserIdRef = useRef(null);
  const callRemoteIdRef = useRef(null);
  const callReadyTimerRef = useRef(null);
  const callTypingTimerRef = useRef(null);
  const callTypingSentRef = useRef(0);
  const callTurnTimerRef = useRef(null);
  const callTurnAppliedRef = useRef(false);
  const callTurnRequestedRef = useRef(false);
  const callIceRestartingRef = useRef(false);
  const callFailureLoggedRef = useRef(false);
  const callSuccessLoggedRef = useRef(false);
  const callStatsTimerRef = useRef(null);
  const callStatsSnapshotRef = useRef({ bytesReceived: 0, timestamp: 0 });
  const callReactionTimersRef = useRef([]);
  const callPrivacyGuardTimerRef = useRef(null);
  const callPrivacyEndingRef = useRef(false);
  const callSessionRef = useRef({ id: null, type: null, channel: null });
  const callChatOpenRef = useRef(false);
  const callLocalReadyRef = useRef(false);
  const callRemoteReadyRef = useRef(false);
  const callRemoteRoleRef = useRef("");
  const callRoleRef = useRef("");
  const pendingOfferRef = useRef(null);
  const callTimingSyncRef = useRef(false);
  const walletIdempotencyRef = useRef({});
  const sessionActionIdempotencyRef = useRef({});
  const paymentInitIdempotencyRef = useRef({});
  const callWarningRef = useRef({ twoMin: false, thirtySec: false, ended: false });
  const clientDraftTimerRef = useRef(null);
  const modelDraftTimerRef = useRef(null);
  const [clientDeleteStatus, setClientDeleteStatus] = useState("");
  const [avatarState, setAvatarState] = useState({
    file: null,
    name: "",
    status: "",
    uploading: false,
  });
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarImageMeta, setAvatarImageMeta] = useState({ width: 0, height: 0 });
  const [avatarCrop, setAvatarCrop] = useState({ scale: 1, x: 0, y: 0 });
  const avatarDragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const [followState, setFollowState] = useState({});
  const [blockState, setBlockState] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    danger: false,
    action: null,
    status: "",
    busy: false,
  });
  const [reportDialog, setReportDialog] = useState({
    open: false,
    targetId: null,
    targetType: "user",
    contentId: null,
    targetLabel: "",
    selectedReason: "",
    expanded: "",
    details: "",
    status: "",
    submitting: false,
  });
  const [blockedList, setBlockedList] = useState([]);
  const [blockedListLoading, setBlockedListLoading] = useState(false);
  const [blockedListStatus, setBlockedListStatus] = useState("");
  const [profileEditOpen, setProfileEditOpen] = useState(false);

  const availabilityOptions = useMemo(
    () => [
      { value: "", label: "Select availability" },
      { value: "Anytime", label: "Anytime" },
      { value: "Always available", label: "Always available" },
      { value: "Flexible / Varies", label: "Flexible / Varies" },
      { value: "By appointment", label: "By appointment" },
      { value: "Custom schedule", label: "Custom schedule" },
      { value: "Weekdays", label: "Weekdays" },
      { value: "Weeknights", label: "Weeknights" },
      { value: "Weekends", label: "Weekends" },
      { value: "Mornings", label: "Mornings" },
      { value: "Afternoons", label: "Afternoons" },
      { value: "Evenings", label: "Evenings" },
      { value: "Late nights", label: "Late nights" },
      { value: "Night owl", label: "Night owl" },
      { value: "On request", label: "On request" },
    ],
    []
  );
  const birthMonthOptions = useMemo(
    () => [
      { value: "", label: "Select month" },
      { value: "1", label: "January" },
      { value: "2", label: "February" },
      { value: "3", label: "March" },
      { value: "4", label: "April" },
      { value: "5", label: "May" },
      { value: "6", label: "June" },
      { value: "7", label: "July" },
      { value: "8", label: "August" },
      { value: "9", label: "September" },
      { value: "10", label: "October" },
      { value: "11", label: "November" },
      { value: "12", label: "December" },
    ],
    []
  );
  const birthYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [{ value: "", label: "Select year" }];
    for (let year = currentYear - 18; year >= 1900; year -= 1) {
      years.push({ value: String(year), label: String(year) });
    }
    return years;
  }, []);
  const savedGallerySet = useMemo(() => new Set(savedGalleryIds), [savedGalleryIds]);
  const avatarMinScale = useMemo(() => {
    if (!avatarImageMeta.width || !avatarImageMeta.height) {
      return 1;
    }
    return Math.max(
      AVATAR_CROP_SIZE / avatarImageMeta.width,
      AVATAR_CROP_SIZE / avatarImageMeta.height
    );
  }, [avatarImageMeta]);
  const callStatusChip = useMemo(() => {
    if (callNetworkStatus === "offline") {
      return { label: "Offline", tone: "danger" };
    }
    if (callConnectionStatus === "reconnecting") {
      return { label: "Reconnecting", tone: "warn" };
    }
    if (callConnectionStatus === "failed") {
      return { label: "Connection issue", tone: "danger" };
    }
    if (callConnectionStatus === "connected") {
      return { label: "Connected", tone: "success" };
    }
    if (callState.connecting) {
      return { label: "Connecting", tone: "warn" };
    }
    return { label: "Ready", tone: "neutral" };
  }, [callNetworkStatus, callConnectionStatus, callState.connecting]);

  const formatSeconds = (value) => {
    if (value == null || Number.isNaN(value)) {
      return "--:--";
    }
    const total = Math.max(0, Math.floor(value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const getCallNow = () => Date.now() + callTimeOffset;

  const showCallToast = (message, tone = "neutral") => {
    setCallToast({ open: true, message, tone });
    setTimeout(() => {
      setCallToast((prev) => (prev.message === message ? { ...prev, open: false } : prev));
    }, 4000);
  };

  const markSynced = (scope) => {
    if (!scope) {
      return;
    }
    setSyncMarks((prev) => ({ ...prev, [scope]: new Date().toISOString() }));
  };

  const parseApiErrorPayload = async (response) => {
    try {
      const payload = await response.json();
      return {
        code: payload?.error || "",
        payload,
      };
    } catch {
      return { code: "", payload: {} };
    }
  };

  const mapApiError = ({ area, status, code, fallback = "Something went wrong." }) => {
    const key = `${area}:${code || ""}`.toLowerCase();
    if (status === 429 || code === "rate_limited") {
      return "You're doing that too quickly. Please wait a moment and try again.";
    }
    if (status === 401 || code === "unauthorized") {
      return "Your Telegram session expired. Reopen the mini app and try again.";
    }
    if (key.includes("sessions/join:session_not_started")) {
      return "Session is not active yet. Check the scheduled time and try again.";
    }
    if (key.includes("sessions/join:invalid_status")) {
      return "This session cannot be joined yet. Wait for acceptance or payment approval.";
    }
    if (key.includes("sessions/join:forbidden")) {
      return "You can't join this session. Reopen from your own sessions list.";
    }
    if (key.includes("sessions/cancel:invalid_status")) {
      return "This session can no longer be cancelled. Open dispute if needed.";
    }
    if (key.includes("sessions/end:already_ended")) {
      return "Session already ended. Refresh to sync the latest status.";
    }
    if (key.includes("payments/initiate:insufficient_wallet")) {
      return "Insufficient wallet balance. Top up or use another payment method.";
    }
    if (key.includes("profile/update:username_taken")) {
      return "That username is taken. Please choose another.";
    }
    if (status >= 500) {
      return "Server error. Try again shortly or contact support if it continues.";
    }
    return fallback;
  };

  const toggleCallChat = () => {
    setCallChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setCallUnreadCount(0);
      }
      return next;
    });
    setCallReactionTrayOpen(false);
  };

  const clearCallReactionTimers = () => {
    callReactionTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    callReactionTimersRef.current = [];
  };

  const clearPrivacyGuardTimer = () => {
    if (callPrivacyGuardTimerRef.current) {
      clearTimeout(callPrivacyGuardTimerRef.current);
      callPrivacyGuardTimerRef.current = null;
    }
  };

  const pushCallReaction = ({ emoji, senderId, senderLabel, self = false }) => {
    if (!emoji) {
      return;
    }
    const id = `${senderId || "anon"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const lane = 18 + Math.round(Math.random() * 64);
    setCallReactions((prev) => [...prev.slice(-11), { id, emoji, senderLabel, self, lane }]);
    const timerId = setTimeout(() => {
      setCallReactions((prev) => prev.filter((item) => item.id !== id));
      callReactionTimersRef.current = callReactionTimersRef.current.filter((entry) => entry !== timerId);
    }, 1900);
    callReactionTimersRef.current.push(timerId);
  };

  const resolveCallTiming = (session = {}) => {
    const durationMinutes = Number(session.duration_minutes || session.durationMinutes || 0);
    const startedAt = session.actual_start || session.started_at || session.startedAt || null;
    const scheduledEnd = session.scheduled_end || session.scheduledEnd || null;
    let endsAt = scheduledEnd;
    if (!endsAt && startedAt && durationMinutes) {
      endsAt = new Date(
        new Date(startedAt).getTime() + durationMinutes * 60 * 1000
      ).toISOString();
    }
    return {
      startedAt: startedAt || null,
      endsAt: endsAt || null,
      durationMinutes: durationMinutes || null,
    };
  };

  const evaluateCallQuality = async () => {
    const pc = callPcRef.current;
    if (!pc || typeof pc.getStats !== "function") {
      return;
    }
    try {
      const report = await pc.getStats();
      let rttMs = 0;
      let jitterMs = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let bytesReceived = 0;
      report.forEach((entry) => {
        if (entry.type === "candidate-pair" && entry.state === "succeeded" && entry.currentRoundTripTime) {
          rttMs = Math.max(rttMs, Number(entry.currentRoundTripTime || 0) * 1000);
        }
        if (entry.type === "inbound-rtp" && !entry.isRemote) {
          const kind = entry.kind || entry.mediaType;
          if (kind === "video" || kind === "audio") {
            jitterMs = Math.max(jitterMs, Number(entry.jitter || 0) * 1000);
            packetsLost += Number(entry.packetsLost || 0);
            packetsReceived += Number(entry.packetsReceived || 0);
            bytesReceived += Number(entry.bytesReceived || 0);
          }
        }
      });
      const now = Date.now();
      const prev = callStatsSnapshotRef.current;
      let bitrateKbps = 0;
      if (prev.timestamp && bytesReceived > prev.bytesReceived && now > prev.timestamp) {
        const deltaBytes = bytesReceived - prev.bytesReceived;
        const deltaMs = now - prev.timestamp;
        bitrateKbps = (deltaBytes * 8) / deltaMs;
      }
      callStatsSnapshotRef.current = { bytesReceived, timestamp: now };
      const totalPackets = packetsLost + packetsReceived;
      const lossRate = totalPackets > 0 ? packetsLost / totalPackets : 0;

      let label = "Excellent";
      let tone = "success";
      if (rttMs > 500 || jitterMs > 70 || lossRate > 0.12 || (bitrateKbps > 0 && bitrateKbps < 140)) {
        label = "Poor";
        tone = "danger";
      } else if (
        rttMs > 260 ||
        jitterMs > 35 ||
        lossRate > 0.05 ||
        (bitrateKbps > 0 && bitrateKbps < 280)
      ) {
        label = "Fair";
        tone = "warn";
      }
      setCallQuality({ label, tone });
    } catch {
      // ignore stats failures
    }
  };

  const syncCallTimingFromServer = async () => {
    if (!initData || !callState.sessionId) {
      return;
    }
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, session_id: callState.sessionId }),
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data?.server_time) {
        const serverMs = Number(data.server_time);
        if (!Number.isNaN(serverMs)) {
          setCallTimeOffset(serverMs - Date.now());
        }
      }
      if (data?.session) {
        setCallTiming(resolveCallTiming(data.session));
      }
      if (data?.call_channel) {
        setCallState((prev) =>
          prev.sessionId === callState.sessionId
            ? { ...prev, channelName: data.call_channel }
            : prev
        );
      }
    } catch {
      // ignore sync errors
    }
  };

  const callProgress = useMemo(() => {
    if (!callTiming.durationMinutes || callCountdown.remaining == null) {
      return null;
    }
    const totalSeconds = Math.max(1, callTiming.durationMinutes * 60);
    const remaining = Math.min(totalSeconds, Math.max(0, callCountdown.remaining));
    return remaining / totalSeconds;
  }, [callTiming.durationMinutes, callCountdown.remaining]);

  const onboardingSlides = useMemo(
    () => [
      {
        id: "invitation",
        eyebrow: "The Invitation",
        title: "Velvet Rooms",
        body:
          "A private, members-only space for verified creators and discerning clients. Every interaction is curated.",
        cta: "Begin",
        visual: "invitation",
        image: "/onboarding/invitation.png",
        points: [
          "Private, members-only access",
          "Verified creators only",
        ],
      },
      {
        id: "trust",
        eyebrow: "Trust & Discretion",
        title: "Verified. Private. Secure.",
        body:
          "Adult-only access with creator verification, discreet profiles, and protected data practices.",
        cta: "Continue",
        visual: "trust",
        image: "/onboarding/trust.png",
        points: [
          "18+ only, consent-first",
          "Privacy-led profiles",
        ],
      },
      {
        id: "access",
        eyebrow: "Access, Made Simple",
        title: "Unlock the Gallery",
        body:
          "One-time access fee. Admin approval unlocks the gallery.",
        cta: "Get Started",
        visual: "access",
        image: "/onboarding/access.png",
        points: [
          "Admin approval required",
          "Instant access after approval",
        ],
      },
    ],
    []
  );
  const onboardingTotal = onboardingSlides.length;
  const onboardingCurrent = onboardingSlides[Math.min(onboardingStep, onboardingTotal - 1)];
  const onboardingProgress = Math.round(
    ((Math.min(onboardingStep, onboardingTotal - 1) + 1) / onboardingTotal) * 100
  );
  const [profileEditStatus, setProfileEditStatus] = useState("");
  const [profileEditSaving, setProfileEditSaving] = useState(false);
  const [profileSavedStatus, setProfileSavedStatus] = useState("");
  const [profileEditForm, setProfileEditForm] = useState({
    username: "",
    email: "",
    location: "",
    birthMonth: "",
    birthYear: "",
    stageName: "",
    bio: "",
    tags: "",
    availability: "",
  });
  const [profileCountryIso, setProfileCountryIso] = useState("");
  const [profileRegionName, setProfileRegionName] = useState("");
  const [profileLocationDirty, setProfileLocationDirty] = useState(false);
  const [visibleTeasers, setVisibleTeasers] = useState({});
  const [consumedTeasers, setConsumedTeasers] = useState({});
  const [previewOverlay, setPreviewOverlay] = useState({
    open: false,
    item: null,
    remaining: 0,
  });
  const [creatorOverlay, setCreatorOverlay] = useState({
    open: false,
    creator: null,
  });
  const [showContentForm, setShowContentForm] = useState(false);
  const [contentStatus, setContentStatus] = useState("");
  const [modelItems, setModelItems] = useState([]);
  const [modelItemsStatus, setModelItemsStatus] = useState("");
  const [followers, setFollowers] = useState([]);
  const [followersStatus, setFollowersStatus] = useState("");
  const [followersFilter, setFollowersFilter] = useState("all");
  const [followersStats, setFollowersStats] = useState(null);
  const [following, setFollowing] = useState([]);
  const [followingStatus, setFollowingStatus] = useState("");
  const [followingLoading, setFollowingLoading] = useState(false);
  const [myBookings, setMyBookings] = useState([]);
  const [myBookingsStatus, setMyBookingsStatus] = useState("");
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [myBookingsPage, setMyBookingsPage] = useState(0);
  const [myBookingsHasMore, setMyBookingsHasMore] = useState(false);
  const [myBookingsLoadingMore, setMyBookingsLoadingMore] = useState(false);
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
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const rawClient = window.localStorage.getItem(CLIENT_DRAFT_KEY);
    if (rawClient) {
      try {
        const draft = JSON.parse(rawClient);
        if (draft?.form) {
          setClientForm((prev) => ({ ...prev, ...draft.form }));
        }
        if (draft?.countryIso) {
          setClientCountryIso(draft.countryIso);
        }
        if (draft?.regionName) {
          setClientRegionName(draft.regionName);
        }
        if (draft?.step) {
          setClientStep(draft.step);
        }
      } catch {
        // ignore draft parse errors
      }
    }
    const rawModel = window.localStorage.getItem(MODEL_DRAFT_KEY);
    if (rawModel) {
      try {
        const draft = JSON.parse(rawModel);
        if (draft?.form) {
          setModelForm((prev) => ({ ...prev, ...draft.form }));
        }
        if (draft?.countryIso) {
          setModelCountryIso(draft.countryIso);
        }
        if (draft?.regionName) {
          setModelRegionName(draft.regionName);
        }
        if (draft?.step) {
          setModelStep(draft.step);
        }
      } catch {
        // ignore draft parse errors
      }
    }
    const rawSaved = window.localStorage.getItem("vr_saved_gallery");
    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        if (Array.isArray(parsed)) {
          setSavedGalleryIds(parsed);
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (clientAccessPaid || role !== "client") {
      return;
    }
    if (clientDraftTimerRef.current) {
      clearTimeout(clientDraftTimerRef.current);
    }
    clientDraftTimerRef.current = setTimeout(() => {
      window.localStorage.setItem(
        CLIENT_DRAFT_KEY,
        JSON.stringify({
          form: clientForm,
          countryIso: clientCountryIso,
          regionName: clientRegionName,
          step: clientStep,
        })
      );
    }, 400);
    return () => {
      if (clientDraftTimerRef.current) {
        clearTimeout(clientDraftTimerRef.current);
      }
    };
  }, [clientForm, clientCountryIso, clientRegionName, clientStep, clientAccessPaid, role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (modelApproved || role !== "model") {
      return;
    }
    if (modelDraftTimerRef.current) {
      clearTimeout(modelDraftTimerRef.current);
    }
    modelDraftTimerRef.current = setTimeout(() => {
      const form = { ...modelForm, videoFile: null };
      window.localStorage.setItem(
        MODEL_DRAFT_KEY,
        JSON.stringify({
          form,
          countryIso: modelCountryIso,
          regionName: modelRegionName,
          step: modelStep,
        })
      );
    }, 400);
    return () => {
      if (modelDraftTimerRef.current) {
        clearTimeout(modelDraftTimerRef.current);
      }
    };
  }, [modelForm, modelCountryIso, modelRegionName, modelStep, modelApproved, role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("vr_saved_gallery", JSON.stringify(savedGalleryIds));
  }, [savedGalleryIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (clientAccessPaid) {
      window.localStorage.removeItem(CLIENT_DRAFT_KEY);
    }
  }, [clientAccessPaid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (modelApproved) {
      window.localStorage.removeItem(MODEL_DRAFT_KEY);
    }
  }, [modelApproved]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleOnline = () => setCallNetworkStatus("online");
    const handleOffline = () => setCallNetworkStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setCallNetworkStatus(navigator.onLine ? "online" : "offline");
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const handleVisibility = () => {
      setPageVisible(!document.hidden);
    };
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSyncTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!callState.open) {
      setCallCountdown({ remaining: null, elapsed: null });
      setCallTiming({ startedAt: null, endsAt: null, durationMinutes: null });
      setCallReactions([]);
      setCallReactionTrayOpen(false);
      setCallUnreadCount(0);
      setCallChatOpen(false);
      setCallMenuOpen(false);
      setCallToast({ open: false, message: "", tone: "neutral" });
      setCallEndDialog({ open: false, reason: "", note: "", status: "", sending: false });
      setCallConclusion({ open: false, title: "", body: "" });
      setCallTimeOffset(0);
      setCallRemoteVideoReady(false);
      clearCallReactionTimers();
      clearPrivacyGuardTimer();
      callPrivacyEndingRef.current = false;
      callWarningRef.current = { twoMin: false, thirtySec: false, ended: false };
      return;
    }
    callPrivacyEndingRef.current = false;
    callWarningRef.current = { twoMin: false, thirtySec: false, ended: false };
  }, [callState.open]);

  useEffect(() => {
    callChatOpenRef.current = callChatOpen;
  }, [callChatOpen]);

  useEffect(() => {
    if (!callState.open) {
      return;
    }
    if (callState.sessionType === "chat" || callChatOpen) {
      setCallUnreadCount(0);
    }
  }, [callState.open, callState.sessionType, callChatOpen]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }
    const timerId = setTimeout(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
    }, 40);
    return () => clearTimeout(timerId);
  }, [callMessages, callTyping, callChatOpen, callState.sessionType]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    if (
      !callState.open ||
      callState.sessionType !== "video" ||
      callPreflight.open ||
      callConclusion.open ||
      callConnectionStatus !== "connected"
    ) {
      return;
    }

    const armPrivacyGuard = (source) => {
      if (callPrivacyEndingRef.current) {
        return;
      }
      clearPrivacyGuardTimer();
      callPrivacyGuardTimerRef.current = setTimeout(() => {
        triggerPrivacyAutoEnd(source, { notifyPeer: true }).catch(() => null);
      }, 1200);
    };
    const disarmPrivacyGuard = () => clearPrivacyGuardTimer();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        armPrivacyGuard("visibility_hidden");
        return;
      }
      disarmPrivacyGuard();
    };
    const handleBlur = () => armPrivacyGuard("window_blur");
    const handleFocus = () => disarmPrivacyGuard();
    const handlePageHide = () => armPrivacyGuard("page_hidden");
    const handleKeyUp = (event) => {
      if (event.key === "PrintScreen") {
        triggerPrivacyAutoEnd("print_screen_key", { notifyPeer: true }).catch(() => null);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      clearPrivacyGuardTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    callState.open,
    callState.sessionType,
    callConnectionStatus,
    callPreflight.open,
    callConclusion.open,
  ]);

  useEffect(() => {
    if (!callState.open || callState.sessionType === "chat") {
      return;
    }
    if (callConnectionStatus !== "connected") {
      return;
    }
    if (callTimingSyncRef.current) {
      return;
    }
    callTimingSyncRef.current = true;
    syncCallTimingFromServer().catch(() => null);
  }, [callState.open, callState.sessionType, callConnectionStatus, callState.sessionId, initData]);

  useEffect(() => {
    if (!callState.open || callState.sessionType === "chat") {
      return;
    }
    if (!callTiming.startedAt && callTiming.durationMinutes && callConnectionStatus === "connected") {
      const startedAt = new Date(getCallNow()).toISOString();
      const endsAt = new Date(
        getCallNow() + callTiming.durationMinutes * 60 * 1000
      ).toISOString();
      setCallTiming((prev) => ({ ...prev, startedAt, endsAt }));
    }
  }, [callState.open, callState.sessionType, callTiming, callConnectionStatus, callTimeOffset]);

  useEffect(() => {
    if (!callState.open || callState.sessionType === "chat") {
      return;
    }
    if (!callTiming.endsAt || !callTiming.startedAt) {
      setCallCountdown({ remaining: null, elapsed: null });
      return;
    }
    const updateTimer = () => {
      const now = getCallNow();
      const start = new Date(callTiming.startedAt).getTime();
      const end = new Date(callTiming.endsAt).getTime();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      const elapsed = Math.max(0, Math.floor((now - start) / 1000));
      setCallCountdown({ remaining, elapsed });
      if (remaining <= 120 && !callWarningRef.current.twoMin) {
        callWarningRef.current.twoMin = true;
        showCallToast("2 minutes left in this session.", "warn");
      }
      if (remaining <= 30 && !callWarningRef.current.thirtySec) {
        callWarningRef.current.thirtySec = true;
        showCallToast("30 seconds left.", "warn");
      }
      if (remaining <= 0 && !callWarningRef.current.ended) {
        callWarningRef.current.ended = true;
        handleAutoCallEnd();
      }
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [callState.open, callState.sessionType, callTiming, callTimeOffset]);

  useEffect(() => {
    if (
      !callState.open ||
      callState.sessionType === "chat" ||
      callConnectionStatus !== "connected"
    ) {
      setCallQuality({ label: "Unknown", tone: "neutral" });
      callStatsSnapshotRef.current = { bytesReceived: 0, timestamp: 0 };
      if (callStatsTimerRef.current) {
        clearInterval(callStatsTimerRef.current);
        callStatsTimerRef.current = null;
      }
      return;
    }
    evaluateCallQuality().catch(() => null);
    callStatsTimerRef.current = setInterval(() => {
      evaluateCallQuality().catch(() => null);
    }, 5000);
    return () => {
      if (callStatsTimerRef.current) {
        clearInterval(callStatsTimerRef.current);
        callStatsTimerRef.current = null;
      }
    };
  }, [callState.open, callState.sessionType, callConnectionStatus]);
  const modelEngagementTotals = useMemo(() => {
    if (!Array.isArray(modelItems) || modelItems.length === 0) {
      return { likes: 0, views: 0 };
    }
    return modelItems.reduce(
      (acc, item) => ({
        likes: acc.likes + Number(item.likes_count || 0),
        views: acc.views + Number(item.views_count || 0),
      }),
      { likes: 0, views: 0 }
    );
  }, [modelItems]);
  const [contentForm, setContentForm] = useState({
    title: "",
    description: "",
    unlockPrice: "",
    contentType: "image",
    publishAt: "",
    expiresAt: "",
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
  const clientDisplayName =
    profile?.client?.display_name ||
    profile?.user?.username ||
    profile?.user?.public_id ||
    "Client";
  const modelDisplayName =
    profile?.model?.display_name ||
    profile?.user?.username ||
    profile?.user?.public_id ||
    "Model";
  const selfDisplayName = role === "model" ? modelDisplayName : clientDisplayName;
  const clientLocationValue = buildLocationValue(clientCountryIso, clientRegionName);
  const modelLocationValue = buildLocationValue(modelCountryIso, modelRegionName);
  const profileLocationValue = buildLocationValue(profileCountryIso, profileRegionName);
  const clientRegionData = useMemo(
    () => getRegionOptions(clientCountryIso),
    [clientCountryIso]
  );
  const modelRegionData = useMemo(
    () => getRegionOptions(modelCountryIso),
    [modelCountryIso]
  );
  const profileRegionData = useMemo(
    () => getRegionOptions(profileCountryIso),
    [profileCountryIso]
  );
  const blockedIds = profile?.blocked_ids || [];
  const isBlocked = (targetId) => blockedIds.includes(targetId);
  const showVideoTiles = callState.sessionType === "video" && !callState.audioOnly;
  const showAudioTiles =
    callState.sessionType === "voice" ||
    (callState.sessionType === "video" && callState.audioOnly);
  const callRemainingLabel =
    callState.sessionType === "chat"
      ? "Chat open"
      : callCountdown.remaining != null
      ? `${formatSeconds(callCountdown.remaining)} left`
      : callConnectionStatus === "connected"
      ? "In call"
      : "Waiting";
  const callElapsedLabel =
    callCountdown.elapsed != null ? formatSeconds(callCountdown.elapsed) : "--:--";

  const profileChecklist = useMemo(() => {
    if (!profile?.user || !role) {
      return { percent: 0, total: 0, completed: 0, missing: [] };
    }
    if (role === "client") {
      const client = profile.client || {};
      const missing = [];
      if (!profile.user.avatar_url) missing.push("Add a profile photo");
      if (!client.display_name && !profile.user.username) missing.push("Add a display name");
      if (!profile.user.email) missing.push("Add an email");
      if (!client.location) missing.push("Add a location");
      if (!client.birth_month || !client.birth_year) missing.push("Add birth month/year");
      const total = 5;
      const completed = total - missing.length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      return { percent, total, completed, missing };
    }
    const model = profile.model || {};
    const missing = [];
    if (!profile.user.avatar_url) missing.push("Add a profile photo");
    if (!model.display_name) missing.push("Add a stage name");
    if (!model.location) missing.push("Add a location");
    if (!model.bio) missing.push("Add a short bio");
    if (!model.tags) missing.push("Add creator tags");
    if (!model.availability) missing.push("Set availability");
    if (model.verification_status !== "approved") missing.push("Complete verification");
    const total = 7;
    const completed = total - missing.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { percent, total, completed, missing };
  }, [profile, role]);

  const visibleGalleryItems = useMemo(() => {
    if (galleryFilter === "liked") {
      return galleryItems.filter((item) => item.has_liked);
    }
    if (galleryFilter === "saved") {
      return galleryItems.filter((item) => savedGallerySet.has(item.id));
    }
    return galleryItems;
  }, [galleryFilter, galleryItems, savedGallerySet]);

  const filteredFollowers = followers.filter((item) => {
    if (followersFilter === "online") {
      return item.is_online;
    }
    if (followersFilter === "offline") {
      return !item.is_online;
    }
    return true;
  });
  const visibleClientSessions = useMemo(() => {
    if (sessionListMode === "chat") {
      return clientSessions.filter((item) => item.session_type === "chat");
    }
    if (sessionListMode === "calls") {
      return clientSessions.filter((item) => item.session_type !== "chat");
    }
    return clientSessions;
  }, [clientSessions, sessionListMode]);
  const visibleModelBookings = useMemo(() => {
    if (sessionListMode === "chat") {
      return myBookings.filter((item) => item.session_type === "chat");
    }
    if (sessionListMode === "calls") {
      return myBookings.filter((item) => item.session_type !== "chat");
    }
    return myBookings;
  }, [myBookings, sessionListMode]);
  const sessionStreak = useMemo(() => {
    const completed = (clientSessions || [])
      .filter((item) => item.status === "completed")
      .map((item) => item.actual_start || item.scheduled_for || item.created_at)
      .filter(Boolean)
      .map((value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
      })
      .filter(Boolean);
    if (!completed.length) {
      return 0;
    }
    const uniqueDays = Array.from(new Set(completed)).sort().reverse();
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (let index = 0; index < 30; index += 1) {
      const day = cursor.toISOString().slice(0, 10);
      if (uniqueDays.includes(day)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (index === 0) {
        cursor.setDate(cursor.getDate() - 1);
        const yesterday = cursor.toISOString().slice(0, 10);
        if (uniqueDays.includes(yesterday)) {
          streak += 1;
          continue;
        }
      }
      break;
    }
    return streak;
  }, [clientSessions]);
  const currentSyncScope =
    role === "model"
      ? modelTab === "sessions"
        ? "bookings"
        : modelTab === "followers"
        ? "followers"
        : modelTab === "earnings"
        ? "earnings"
        : modelTab === "content"
        ? "model_content"
        : "profile"
      : clientTab === "sessions"
      ? "client_sessions"
      : clientTab === "following"
      ? "following"
      : clientTab === "wallet"
      ? "wallet"
      : clientTab === "purchases"
      ? "purchases"
      : clientTab === "profile"
      ? "profile"
      : "gallery";
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
  const formatSessionTime = (session) => {
    const scheduled = session?.scheduled_for || session?.scheduledFor || null;
    if (scheduled) {
      try {
        return new Date(scheduled).toLocaleString();
      } catch {
        return "Scheduled";
      }
    }
    const started = session?.actual_start || session?.started_at || null;
    if (started) {
      try {
        return `Started ${new Date(started).toLocaleString()}`;
      } catch {
        return "In progress";
      }
    }
    return "Flexible schedule";
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
    await loadBookingsPage(0, false);
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
      setBookingActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info:
            action === "accept"
              ? "Session accepted. Open the session to start."
              : action === "cancel"
              ? "Session cancelled. Moved to dispute review."
              : "Session declined.",
        },
      }));
      await refreshBookings();
      await refreshProfile();
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

  const appendCallMessage = (message) => {
    setCallMessages((prev) => {
      const next = [...prev, message];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
  };

  const removeCallMessage = (id) => {
    if (!id) {
      return;
    }
    setCallMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  const detectContactPolicyViolation = (text) => {
    const input = (text || "").toString();
    if (!input) {
      return "";
    }
    const phoneMatches = input.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [];
    const hasPhone = phoneMatches.some((segment) => {
      const digits = segment.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    });
    if (hasPhone) {
      return "phone_number";
    }
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input)) {
      return "email";
    }
    if (/(https?:\/\/|www\.)\S+/i.test(input) || /(t\.me\/|wa\.me\/)/i.test(input)) {
      return "link";
    }
    if (/(^|\s)@[a-zA-Z0-9_]{5,}(?=\s|$)/.test(input)) {
      return "handle";
    }
    if (/\b(telegram|whatsapp|snapchat|instagram|discord|signal|facetime|call me)\b/i.test(input)) {
      return "external_contact";
    }
    return "";
  };

  const formatContactPolicyMessage = (reason) => {
    if (reason === "email") {
      return "Emails are blocked. Keep communication in-app.";
    }
    if (reason === "link") {
      return "External links are blocked. Keep communication in-app.";
    }
    if (reason === "handle") {
      return "User handles are blocked. Keep communication in-app.";
    }
    if (reason === "external_contact") {
      return "External contact requests are blocked.";
    }
    return "Phone numbers are blocked. Message removed.";
  };

  const isCallOfferer = () => {
    const localRole = callRoleRef.current;
    const remoteRole = callRemoteRoleRef.current;
    if (localRole && remoteRole) {
      if (localRole === "client" && remoteRole === "model") {
        return true;
      }
      if (localRole === "model" && remoteRole === "client") {
        return false;
      }
    }
    const localUserId = callUserIdRef.current;
    const remoteUserId = callRemoteIdRef.current;
    if (!localUserId || !remoteUserId) {
      return false;
    }
    return Number(localUserId) < Number(remoteUserId);
  };

  const maybeStartOffer = async () => {
    if (!callLocalReadyRef.current || !callRemoteReadyRef.current) {
      return;
    }
    if (offerSentRef.current) {
      return;
    }
    if (!isCallOfferer()) {
      return;
    }
    const pc = callPcRef.current;
    if (!pc) {
      return;
    }
    offerSentRef.current = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendCallSignal({ type: "offer", sdp: pc.localDescription, role: callRoleRef.current });
    scheduleTurnFallback("initial-offer");
  };

  const updateCallMessageStatus = (id, status) => {
    if (!id) {
      return;
    }
    setCallMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, status } : msg))
    );
  };

  const sendTypingSignal = async () => {
    const channel = callChannelRef.current;
    if (!channel) {
      return;
    }
    const now = Date.now();
    if (now - callTypingSentRef.current < 2000) {
      return;
    }
    callTypingSentRef.current = now;
    await channel.send({
      type: "broadcast",
      event: "typing",
      payload: { senderId: callUserIdRef.current },
    });
  };

  const sendCallSignal = async (payload) => {
    const channel = callChannelRef.current;
    if (!channel) {
      return;
    }
    const userId = callUserIdRef.current;
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, userId },
    });
  };

  const startReadyLoop = async () => {
    if (!callChannelRef.current) {
      return;
    }
    await sendCallSignal({ type: "ready", role: callRoleRef.current });
    if (callReadyTimerRef.current) {
      clearInterval(callReadyTimerRef.current);
    }
    callReadyTimerRef.current = setInterval(() => {
      sendCallSignal({ type: "ready", role: callRoleRef.current }).catch(() => null);
    }, 3000);
  };

  const logCallEvent = async (eventType, payload = {}) => {
    if (!initData) {
      return;
    }
    try {
      await fetch("/api/metrics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          event_type: eventType,
          session_id: callState.sessionId,
          payload,
        }),
      });
    } catch {
      // ignore metrics failures
    }
  };

  const loadNotifications = async (silent = false) => {
    if (!initData) {
      return;
    }
    if (!silent) {
      setNotifications((prev) => ({ ...prev, loading: true, error: "" }));
    }
    try {
      const res = await fetch("/api/notifications", {
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
      markSynced("notifications");
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
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          ids: Array.isArray(ids) ? ids : [],
        }),
      });
    } catch {
      // ignore mark read failures
    }
  };

  const pushLocalNotification = (notification, persist = false) => {
    const item = {
      id: notification.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: notification.title || "Notification",
      body: notification.body || "",
      type: notification.type || "",
      metadata: notification.metadata || null,
      created_at: notification.created_at || new Date().toISOString(),
      read_at: null,
    };
    setNotifications((prev) => ({
      ...prev,
      items: [item, ...(prev.items || [])].slice(0, 40),
      unread: Math.max(0, (prev.unread || 0) + 1),
    }));
    if (persist && initData) {
      fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          title: item.title,
          body: item.body,
          type: item.type,
          metadata: item.metadata,
        }),
      }).catch(() => null);
    }
  };

  const openNotifications = () => {
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setProfileEditOpen(false);
    setNotifications((prev) => ({ ...prev, open: true }));
    loadNotifications(true).catch(() => null);
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

  const jumpToNotificationTarget = (elementId) => {
    if (!elementId || typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      const node = document.getElementById(elementId);
      if (!node) {
        return;
      }
      node.classList.add("focus-pulse");
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => node.classList.remove("focus-pulse"), 1800);
    });
  };

  const handleNotificationClick = async (item) => {
    const meta = parseNotificationMetadata(item?.metadata);
    const type = (item?.type || "").toString();
    const contentId = Number(meta?.content_id || 0);
    const sessionId = Number(meta?.session_id || 0);
    if (item?.id) {
      await markNotificationsRead([item.id]);
    }
    setNotifications((prev) => ({
      ...prev,
      unread: Math.max(0, (prev.unread || 0) - (item?.read_at ? 0 : 1)),
      items: (prev.items || []).map((entry) =>
        entry.id === item.id ? { ...entry, read_at: entry.read_at || new Date().toISOString() } : entry
      ),
    }));

    if (type === "content_like" || type === "content_approved" || type === "content_rejected") {
      if (role === "model") {
        setModelTab("content");
        setTimeout(() => jumpToNotificationTarget(`model-content-${contentId}`), 120);
      } else {
        setClientTab("gallery");
        setTimeout(() => jumpToNotificationTarget(`gallery-card-${contentId}`), 120);
      }
      closeNotifications();
      return;
    }
    if (type === "follow") {
      if (role === "model") {
        setModelTab("followers");
      } else {
        setClientTab("following");
      }
      closeNotifications();
      return;
    }
    if (type === "booking_request" || type === "session_approved") {
      if (role === "model") {
        setModelTab("sessions");
        setTimeout(() => jumpToNotificationTarget(`model-booking-${sessionId}`), 120);
      } else {
        setClientTab("sessions");
        setTimeout(() => jumpToNotificationTarget(`client-session-${sessionId}`), 120);
      }
      closeNotifications();
      return;
    }
    if (
      [
        "session_accept",
        "session_declined",
        "session_cancelled",
        "session_end",
        "session_extension",
        "chat_message",
      ].includes(type)
    ) {
      if (role === "model") {
        setModelTab("sessions");
        setTimeout(() => jumpToNotificationTarget(`model-booking-${sessionId}`), 120);
      } else {
        setClientTab("sessions");
        setTimeout(() => jumpToNotificationTarget(`client-session-${sessionId}`), 120);
      }
      closeNotifications();
      return;
    }
    if (type === "access_fee_approved") {
      setClientTab("gallery");
      closeNotifications();
      return;
    }
    if (type === "content_unlocked") {
      setClientTab("gallery");
      setTimeout(() => jumpToNotificationTarget(`gallery-card-${contentId}`), 120);
      closeNotifications();
      return;
    }
    if (type === "escrow_refunded" || type === "escrow_released") {
      if (role === "model") {
        setModelTab("earnings");
      } else {
        setClientTab("wallet");
      }
      closeNotifications();
      return;
    }
    if (type === "verification_approved" || type === "verification_rejected") {
      setModelTab("profile");
      closeNotifications();
      return;
    }
    closeNotifications();
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

  const notificationGroups = useMemo(() => {
    const groups = [];
    const items = notifications.items || [];
    for (const item of items) {
      const stamp = item?.created_at ? new Date(item.created_at) : null;
      const label = stamp && !Number.isNaN(stamp.getTime()) ? stamp.toDateString() : "Recent";
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
    const contentId = Number(meta?.content_id || 0);
    const sessionId = Number(meta?.session_id || 0);
    if (contentId) {
      return `Content #${contentId}`;
    }
    if (sessionId) {
      return `Session #${sessionId}`;
    }
    if (meta?.amount) {
      return `Amount: ₦${Number(meta.amount || 0).toLocaleString()}`;
    }
    if (meta?.outcome) {
      return `Outcome: ${meta.outcome}`;
    }
    return item?.type ? item.type.replace(/_/g, " ") : "General";
  };

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
      const mins = Math.floor(diffSec / 60);
      return `Seen ${mins}m ago`;
    }
    if (diffSec < 86400) {
      const hrs = Math.floor(diffSec / 3600);
      return `Seen ${hrs}h ago`;
    }
    const days = Math.floor(diffSec / 86400);
    return `Seen ${days}d ago`;
  };

  const cleanupCall = (notifyRemote = true, resetState = true) => {
    if (notifyRemote) {
      sendCallSignal({ type: "hangup" }).catch(() => null);
    }
    const channel = callChannelRef.current;
    if (channel) {
      channel.unsubscribe().catch(() => null);
    }
    callChannelRef.current = null;
    callChannelSubscribedRef.current = false;
    callRemoteIdRef.current = null;
    callUserIdRef.current = null;
    callSessionRef.current = { id: null, type: null, channel: null };
    callLocalReadyRef.current = false;
    callRemoteReadyRef.current = false;
    callRemoteRoleRef.current = "";
    callRoleRef.current = "";
    pendingOfferRef.current = null;
    callTimingSyncRef.current = false;
    if (callReadyTimerRef.current) {
      clearInterval(callReadyTimerRef.current);
      callReadyTimerRef.current = null;
    }
    if (callTypingTimerRef.current) {
      clearTimeout(callTypingTimerRef.current);
      callTypingTimerRef.current = null;
    }
    if (callTurnTimerRef.current) {
      clearTimeout(callTurnTimerRef.current);
      callTurnTimerRef.current = null;
    }
    if (callStatsTimerRef.current) {
      clearInterval(callStatsTimerRef.current);
      callStatsTimerRef.current = null;
    }
    callStatsSnapshotRef.current = { bytesReceived: 0, timestamp: 0 };
    callTurnAppliedRef.current = false;
    callTurnRequestedRef.current = false;
    callIceRestartingRef.current = false;
    callFailureLoggedRef.current = false;
    callSuccessLoggedRef.current = false;
    callPrivacyEndingRef.current = false;
    clearPrivacyGuardTimer();
    clearCallReactionTimers();
    offerSentRef.current = false;
    if (callPcRef.current) {
      callPcRef.current.ontrack = null;
      callPcRef.current.onicecandidate = null;
      callPcRef.current.onconnectionstatechange = null;
      callPcRef.current.close();
    }
    callPcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (resetState) {
      setCallMessages([]);
      setCallReactions([]);
      setCallReactionTrayOpen(false);
      setCallInput("");
      setCallTyping(false);
      setCallRemoteVideoReady(false);
      setCallState((prev) => ({
        ...prev,
        open: false,
        sessionId: null,
        sessionType: "",
        channelName: "",
        status: "",
        connecting: false,
        micMuted: false,
        cameraOff: false,
        peerReady: false,
        audioOnly: false,
        peerLabel: "",
      }));
      setCallPreflight({
        open: false,
        mic: "unknown",
        cam: "unknown",
        audioOnly: false,
        checking: false,
      });
      setCallConnectionStatus("idle");
      setCallQuality({ label: "Unknown", tone: "neutral" });
      setCallTimeOffset(0);
    }
  };

  const showCallConclusion = (message = "Thanks for joining. Your session has concluded.") => {
    setCallRating({ value: 0, submitted: false, status: "" });
    setCallConclusion({
      open: true,
      title: "Session concluded",
      body: message,
    });
    setCallState((prev) => ({
      ...prev,
      connecting: false,
      status: "Session concluded.",
    }));
    setCallMenuOpen(false);
  };

  const closeCallConclusion = () => {
    setCallRating({ value: 0, submitted: false, status: "" });
    setCallConclusion({ open: false, title: "", body: "" });
    cleanupCall(false);
  };

  const submitCallRating = async (value) => {
    if (!callState.sessionId || !initData || !value) {
      return;
    }
    setCallRating({ value, submitted: false, status: "Submitting…" });
    try {
      await fetch("/api/metrics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          event_type: "session_rating",
          session_id: callState.sessionId,
          payload: { rating: value },
        }),
      });
      setCallRating({ value, submitted: true, status: "Thanks for your feedback." });
    } catch {
      setCallRating({ value, submitted: false, status: "Could not submit rating right now." });
    }
  };

  const handleCallSignal = async (payload) => {
    if (!payload) {
      return;
    }
    const localUserId = callUserIdRef.current;
    if (payload.userId && payload.userId === localUserId) {
      return;
    }
    if (payload.type === "turn-needed") {
      triggerTurnFallback(payload.reason || "peer-request").catch(() => null);
      return;
    }
    if (payload.type === "ready") {
      callRemoteIdRef.current = payload.userId || null;
      callRemoteRoleRef.current = payload.role || "";
      callRemoteReadyRef.current = true;
      if (callReadyTimerRef.current) {
        clearInterval(callReadyTimerRef.current);
        callReadyTimerRef.current = null;
      }
      setCallState((prev) => ({
        ...prev,
        peerReady: true,
        status: prev.status || "Partner connected.",
      }));
      await maybeStartOffer();
      return;
    }
    if (payload.type === "session-ended") {
      showCallConclusion("Your session has concluded. Thanks for spending time here.");
      cleanupCall(false, false);
      return;
    }
    if (payload.type === "privacy-violation") {
      triggerPrivacyAutoEnd(
        `peer_${payload.source || "privacy_violation"}`,
        { notifyPeer: false }
      ).catch(() => {
        cleanupCall(false);
      });
      return;
    }
    if (payload.type === "hangup") {
      showCallToast("Call ended by partner.", "neutral");
      cleanupCall(false);
      return;
    }
    const pc = callPcRef.current;
    if (!pc) {
      return;
    }
    if (payload.type === "offer" && payload.sdp) {
      if (payload.userId) {
        callRemoteIdRef.current = payload.userId;
      }
      callRemoteRoleRef.current = payload.role || callRemoteRoleRef.current;
      if (!callLocalReadyRef.current) {
        pendingOfferRef.current = payload;
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal({ type: "answer", sdp: pc.localDescription, role: callRoleRef.current });
      scheduleTurnFallback("answer-sent");
      return;
    }
    if (payload.type === "answer" && payload.sdp) {
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
      return;
    }
    if (payload.type === "ice" && payload.candidate) {
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        // ignore candidate errors during renegotiation
      }
    }
  };

  const getStunServers = () => [
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const buildIceConfig = (turnServers = []) => ({
    iceServers: [...getStunServers(), ...turnServers],
    iceTransportPolicy: "all",
  });

  const buildVideoConstraints = () => {
    const width = typeof window !== "undefined" ? window.innerWidth : 390;
    let idealWidth = 640;
    let idealHeight = 480;
    if (width < 360) {
      idealWidth = 480;
      idealHeight = 360;
    } else if (width >= 900) {
      idealWidth = 960;
      idealHeight = 540;
    }
    return {
      width: { ideal: idealWidth, max: 960 },
      height: { ideal: idealHeight, max: 540 },
      frameRate: { ideal: 24, max: 30 },
    };
  };

  const buildMediaConstraints = (sessionType, audioOnly) => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: sessionType === "video" && !audioOnly ? buildVideoConstraints() : false,
  });

  const applySenderBitrateCaps = (pc) => {
    if (!pc) {
      return;
    }
    pc.getSenders().forEach((sender) => {
      const track = sender.track;
      if (!track) {
        return;
      }
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) {
        params.encodings = [{}];
      }
      const encoding = params.encodings[0];
      if (track.kind === "video") {
        encoding.maxBitrate = 700000;
        params.degradationPreference = "balanced";
      }
      if (track.kind === "audio") {
        encoding.maxBitrate = 48000;
      }
      sender.setParameters(params).catch(() => null);
    });
  };

  const fetchTurnServers = async () => {
    if (!initData) {
      return [];
    }
    const iceRes = await fetch("/api/calls/ice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    if (!iceRes.ok) {
      return [];
    }
    const icePayload = await iceRes.json();
    return icePayload?.iceServers || [];
  };

  const clearTurnFallbackTimer = () => {
    if (callTurnTimerRef.current) {
      clearTimeout(callTurnTimerRef.current);
      callTurnTimerRef.current = null;
    }
  };

  const scheduleTurnFallback = (reason) => {
    if (callTurnTimerRef.current || callTurnAppliedRef.current) {
      return;
    }
    callTurnTimerRef.current = setTimeout(() => {
      callTurnTimerRef.current = null;
      const pc = callPcRef.current;
      if (!pc || callTurnAppliedRef.current) {
        return;
      }
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        return;
      }
      triggerTurnFallback(reason).catch(() => null);
    }, 4500);
  };

  const triggerTurnFallback = async (reason) => {
    if (callTurnAppliedRef.current || callIceRestartingRef.current) {
      return;
    }
    const localUserId = callUserIdRef.current;
    const remoteUserId = callRemoteIdRef.current;
    const isOfferer = localUserId && remoteUserId && localUserId < remoteUserId;
    if (!isOfferer) {
      await sendCallSignal({ type: "turn-needed", reason });
      return;
    }
    if (callTurnRequestedRef.current) {
      return;
    }
    callTurnRequestedRef.current = true;
    setCallState((prev) => ({
      ...prev,
      status: prev.status || "Optimizing connection…",
    }));
    const turnServers = await fetchTurnServers();
    callTurnRequestedRef.current = false;
    if (!turnServers.length) {
      return;
    }
    callTurnAppliedRef.current = true;
    const pc = callPcRef.current;
    if (!pc) {
      return;
    }
    try {
      pc.setConfiguration(buildIceConfig(turnServers));
    } catch {
      // ignore configuration errors
    }
    if (callIceRestartingRef.current) {
      return;
    }
    callIceRestartingRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await sendCallSignal({ type: "offer", sdp: pc.localDescription, reason: "turn" });
    } finally {
      setTimeout(() => {
        callIceRestartingRef.current = false;
      }, 1500);
    }
  };

  const checkCallDevices = async (sessionType, audioOnly) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCallPreflight((prev) => ({
        ...prev,
        mic: "blocked",
        cam: sessionType === "video" && !audioOnly ? "blocked" : "na",
        checking: false,
      }));
      return;
    }
    setCallPreflight((prev) => ({ ...prev, checking: true }));
    try {
      const constraints = buildMediaConstraints(sessionType, audioOnly);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const micOk = stream.getAudioTracks().length > 0;
      const camOk =
        sessionType === "video" && !audioOnly ? stream.getVideoTracks().length > 0 : true;
      stream.getTracks().forEach((track) => track.stop());
      setCallPreflight((prev) => ({
        ...prev,
        mic: micOk ? "ok" : "blocked",
        cam: sessionType === "video" && !audioOnly ? (camOk ? "ok" : "blocked") : "na",
        checking: false,
      }));
    } catch {
      setCallPreflight((prev) => ({
        ...prev,
        mic: "blocked",
        cam: sessionType === "video" && !audioOnly ? "blocked" : "na",
        checking: false,
      }));
    }
  };

  const startCall = async (sessionId, sessionType, options = {}) => {
    const audioOnly = Boolean(options.audioOnly);
    const channelName =
      options.channelName || callState.channelName || `vr-call-${sessionId}`;
    if (!supabaseClient) {
      setCallState((prev) => ({
        ...prev,
        connecting: false,
        status: "Realtime is not configured.",
      }));
      return;
    }
    if (!initData) {
      setCallState((prev) => ({
        ...prev,
        connecting: false,
        status: "Telegram init data missing.",
      }));
      return;
    }
    const userId = profile?.user?.id;
    if (!userId) {
      setCallState((prev) => ({
        ...prev,
        connecting: false,
        status: "Profile not ready. Try again.",
      }));
      return;
    }
    callUserIdRef.current = userId;
    callSessionRef.current = { id: sessionId, type: sessionType, channel: channelName };
    callLocalReadyRef.current = false;
    callRemoteReadyRef.current = false;
    callRemoteRoleRef.current = "";
    callRoleRef.current = role || "";
    pendingOfferRef.current = null;
    callChannelSubscribedRef.current = false;
    setCallState((prev) => ({
      ...prev,
      connecting: true,
      status: "Connecting…",
      audioOnly,
      cameraOff: audioOnly ? true : prev.cameraOff,
    }));
    setCallConnectionStatus("connecting");

    const channel = supabaseClient.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    callChannelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      handleCallSignal(payload).catch(() => null);
    });

    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      if (!payload || payload.senderId === userId) {
        return;
      }
      const text = (payload.text || "").toString();
      const messageId = payload.id || `${payload.senderId}-${payload.sentAt || Date.now()}`;
      const violation = detectContactPolicyViolation(text);
      if (violation) {
        showCallToast(formatContactPolicyMessage(violation), "warn");
        channel
          .send({
            type: "broadcast",
            event: "chat_remove",
            payload: { messageId, reason: violation, senderId: payload.senderId },
          })
          .catch(() => null);
        return;
      }
      appendCallMessage({
        id: messageId,
        senderId: payload.senderId,
        senderLabel: payload.senderLabel || "Partner",
        text,
        sentAt: payload.sentAt || new Date().toISOString(),
        self: false,
        status: "delivered",
      });
      if (!callChatOpenRef.current && callSessionRef.current.type !== "chat") {
        setCallUnreadCount((prev) => Math.min(99, prev + 1));
        pushLocalNotification(
          {
            title: "New message",
            body: `${payload.senderLabel || "Partner"}: ${payload.text || ""}`.trim(),
            type: "chat_message",
            metadata: { session_id: sessionId },
          },
          true
        );
      }
      if (payload.id) {
        channel
          .send({
            type: "broadcast",
            event: "chat_ack",
            payload: { messageId: payload.id, senderId: payload.senderId },
          })
          .catch(() => null);
      }
    });

    channel.on("broadcast", { event: "chat_remove" }, ({ payload }) => {
      if (!payload?.messageId) {
        return;
      }
      removeCallMessage(payload.messageId);
      if (payload.reason) {
        showCallToast(formatContactPolicyMessage(payload.reason), "warn");
      }
    });

    channel.on("broadcast", { event: "chat_ack" }, ({ payload }) => {
      if (!payload || payload.senderId !== userId) {
        return;
      }
      updateCallMessageStatus(payload.messageId, "delivered");
    });

    channel.on("broadcast", { event: "reaction" }, ({ payload }) => {
      if (!payload || payload.senderId === userId) {
        return;
      }
      pushCallReaction({
        emoji: payload.emoji,
        senderId: payload.senderId,
        senderLabel: payload.senderLabel || "Partner",
        self: false,
      });
    });

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.senderId === userId) {
        return;
      }
      setCallTyping(true);
      if (callTypingTimerRef.current) {
        clearTimeout(callTypingTimerRef.current);
      }
      callTypingTimerRef.current = setTimeout(() => {
        setCallTyping(false);
        callTypingTimerRef.current = null;
      }, 2500);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        callChannelSubscribedRef.current = true;
        if (sessionType === "chat") {
          startReadyLoop().catch(() => null);
        } else if (callLocalReadyRef.current) {
          startReadyLoop().catch(() => null);
        }
        if (sessionType === "chat") {
          setCallState((prev) => ({
            ...prev,
            connecting: false,
            status: "Chat ready.",
          }));
          setCallConnectionStatus("connected");
        }
      }
    });

    if (sessionType === "chat") {
      return;
    }

    setCallState((prev) => ({ ...prev, status: "Requesting microphone/camera…" }));
    const pc = new RTCPeerConnection(buildIceConfig());
    callPcRef.current = pc;
    offerSentRef.current = false;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      } else if (event.track) {
        remoteStream.addTrack(event.track);
      }
      if (event.track?.kind === "video") {
        setCallRemoteVideoReady(true);
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate }).catch(() => null);
      }
    };
    pc.onnegotiationneeded = () => {
      maybeStartOffer().catch(() => null);
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        clearTurnFallbackTimer();
        setCallConnectionStatus("connected");
      } else if (state === "checking") {
        setCallConnectionStatus("connecting");
      } else if (state === "disconnected") {
        setCallConnectionStatus("reconnecting");
        scheduleTurnFallback("ice-disconnected");
      } else if (state === "failed") {
        setCallConnectionStatus("failed");
        clearTurnFallbackTimer();
        triggerTurnFallback("ice-failed").catch(() => null);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearTurnFallbackTimer();
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Connected.",
        }));
        setCallConnectionStatus("connected");
        if (!callSuccessLoggedRef.current) {
          callSuccessLoggedRef.current = true;
          logCallEvent("call_connected", { sessionType: callState.sessionType });
        }
      }
      if (pc.connectionState === "failed") {
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Connection failed. Try again.",
        }));
        setCallConnectionStatus("failed");
        if (!callFailureLoggedRef.current) {
          callFailureLoggedRef.current = true;
          logCallEvent("call_setup_failed", { reason: "connection_failed" });
        }
        clearTurnFallbackTimer();
        triggerTurnFallback("connection-failed").catch(() => null);
      }
      if (pc.connectionState === "disconnected") {
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Disconnected.",
        }));
        setCallConnectionStatus("reconnecting");
        scheduleTurnFallback("connection-disconnected");
      }
    };

    try {
      const constraints = buildMediaConstraints(sessionType, audioOnly);
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      applySenderBitrateCaps(pc);
      if (sessionType === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      callLocalReadyRef.current = true;
      if (callChannelSubscribedRef.current) {
        startReadyLoop().catch(() => null);
      }
      if (pendingOfferRef.current?.sdp) {
        const pending = pendingOfferRef.current;
        pendingOfferRef.current = null;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(pending.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendCallSignal({
            type: "answer",
            sdp: pc.localDescription,
            role: callRoleRef.current,
          });
          scheduleTurnFallback("answer-sent");
        } catch {
          // ignore pending offer errors
        }
      } else {
        await maybeStartOffer();
      }
      setCallState((prev) => ({
        ...prev,
        connecting: true,
        status: "Waiting for partner…",
      }));
    } catch {
      setCallState((prev) => ({
        ...prev,
        connecting: false,
        status: "Microphone/camera permission denied.",
      }));
      if (!callFailureLoggedRef.current) {
        callFailureLoggedRef.current = true;
        logCallEvent("call_setup_failed", { reason: "permission_denied" });
      }
    }
  };

  const startSessionCall = async (sessionId, sessionType, options = {}) => {
    if (!initData || !sessionId) {
      return;
    }
    callFailureLoggedRef.current = false;
    callSuccessLoggedRef.current = false;
    const resolvedType = sessionType || "video";
    const peerLabel = options.label || "";
    const channelName = options.channelName || `vr-call-${sessionId}`;
    if (options.session) {
      setCallTiming(resolveCallTiming(options.session));
    }
    setCallState({
      open: true,
      sessionId,
      sessionType: resolvedType,
      channelName,
      status: "",
      connecting: resolvedType === "chat",
      micMuted: false,
      cameraOff: false,
      peerReady: false,
      audioOnly: false,
      peerLabel,
    });
    setCallMessages([]);
    setCallReactions([]);
    setCallReactionTrayOpen(false);
    setCallUnreadCount(0);
    setCallQuality({ label: "Unknown", tone: "neutral" });
    setCallInput("");
    setCallChatOpen(resolvedType === "chat");
    if (resolvedType === "chat") {
      await startCall(sessionId, resolvedType, { channelName });
      return;
    }
    setCallPreflight({
      open: true,
      mic: "unknown",
      cam: resolvedType === "video" ? "unknown" : "na",
      audioOnly: false,
      checking: false,
    });
    setCallConnectionStatus("idle");
  };

  const beginCallFromPreflight = async () => {
    if (!callState.sessionId || !callState.sessionType) {
      return;
    }
    setCallPreflight((prev) => ({ ...prev, open: false }));
    setCallState((prev) => ({ ...prev, connecting: true, status: "Connecting…" }));
    await startCall(callState.sessionId, callState.sessionType, {
      audioOnly: callPreflight.audioOnly,
      channelName: callState.channelName,
    });
  };

  const openPermissionCheck = (sessionType) => {
    const resolvedType = sessionType || "video";
    setCallState((prev) => ({
      ...prev,
      open: true,
      sessionId: null,
      sessionType: resolvedType,
      channelName: "",
      status: "",
      connecting: false,
      micMuted: false,
      cameraOff: false,
      peerReady: false,
      audioOnly: false,
      peerLabel: "",
    }));
    setCallConnectionStatus("idle");
    setCallReactionTrayOpen(false);
    setCallUnreadCount(0);
    setCallChatOpen(false);
    setCallPreflight({
      open: true,
      mic: "unknown",
      cam: resolvedType === "video" ? "unknown" : "na",
      audioOnly: false,
      checking: false,
    });
    checkCallDevices(resolvedType, false).catch(() => null);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !callState.micMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setCallState((prev) => ({ ...prev, micMuted: nextMuted }));
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextOff = !callState.cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextOff;
    });
    setCallState((prev) => ({ ...prev, cameraOff: nextOff }));
  };

  const sendChatMessage = async () => {
    const message = callInput.trim();
    if (!message || !callChannelRef.current) {
      return;
    }
    const violation = detectContactPolicyViolation(message);
    if (violation) {
      setCallInput("");
      showCallToast(formatContactPolicyMessage(violation), "warn");
      return;
    }
    const senderId = callUserIdRef.current;
    const payload = {
      id: `${senderId || "me"}-${Date.now()}`,
      senderId,
      senderLabel: selfDisplayName || "You",
      text: message,
      sentAt: new Date().toISOString(),
    };
    appendCallMessage({ ...payload, self: true, status: "sending" });
    try {
      await callChannelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload,
      });
      updateCallMessageStatus(payload.id, "sent");
    } catch {
      updateCallMessageStatus(payload.id, "failed");
    }
    setCallInput("");
  };

  const resendFailedCallMessage = async (messageId) => {
    if (!messageId || !callChannelRef.current) {
      return;
    }
    const target = callMessages.find(
      (message) => message.id === messageId && message.self && message.status === "failed"
    );
    if (!target) {
      return;
    }
    updateCallMessageStatus(messageId, "sending");
    try {
      await callChannelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: {
          id: target.id,
          senderId: target.senderId || callUserIdRef.current,
          senderLabel: target.senderLabel || selfDisplayName || "You",
          text: target.text,
          sentAt: new Date().toISOString(),
        },
      });
      updateCallMessageStatus(messageId, "sent");
    } catch {
      updateCallMessageStatus(messageId, "failed");
    }
  };

  const sendCallReaction = async (emoji) => {
    if (!emoji || !callChannelRef.current || callState.sessionType !== "video") {
      return;
    }
    const senderId = callUserIdRef.current;
    const senderLabel = selfDisplayName || "You";
    pushCallReaction({ emoji, senderId, senderLabel, self: true });
    setCallReactionTrayOpen(false);
    try {
      await callChannelRef.current.send({
        type: "broadcast",
        event: "reaction",
        payload: {
          emoji,
          senderId,
          senderLabel,
          sentAt: new Date().toISOString(),
        },
      });
    } catch {
      showCallToast("Unable to send reaction.", "warn");
    }
  };

  const triggerPrivacyAutoEnd = async (source, { notifyPeer = true } = {}) => {
    if (callPrivacyEndingRef.current || !callState.open || callState.sessionType !== "video") {
      return;
    }
    callPrivacyEndingRef.current = true;
    clearPrivacyGuardTimer();
    setCallReactionTrayOpen(false);
    showCallToast("Privacy protection triggered. Session ending.", "warn");
    logCallEvent("screen_recording_detected", { source }).catch(() => null);
    if (notifyPeer) {
      sendCallSignal({ type: "privacy-violation", source }).catch(() => null);
    }
    await submitCallEnd({
      reason: "screen_recording_detected",
      note: source || "privacy_guard",
      auto: true,
    });
  };

  const handleSessionJoin = async (session) => {
    const sessionId = typeof session === "object" ? session?.id : session;
    const sessionType =
      typeof session === "object"
        ? session?.session_type || session?.sessionType
        : null;
    const peerLabel =
      typeof session === "object"
        ? session?.model_label || session?.client_label || session?.label || ""
        : "";
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
        const { code, payload } = await parseApiErrorPayload(res);
        let message = mapApiError({
          area: "sessions/join",
          status: res.status,
          code,
          fallback: `Unable to join session (HTTP ${res.status}).`,
        });
        if (code === "session_not_started" && payload?.scheduled_for) {
          try {
            const when = new Date(payload.scheduled_for).toLocaleString();
            message = `Session starts at ${when}. Try again then.`;
          } catch {
            // keep default mapped message
          }
        }
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: message,
            info: "",
          },
        }));
        return;
      }
      const data = await res.json();
      if (!data?.ok) {
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: "Unable to start session.",
            info: "",
          },
        }));
        return;
      }
      if (data?.server_time) {
        const serverMs = Number(data.server_time);
        if (!Number.isNaN(serverMs)) {
          setCallTimeOffset(serverMs - Date.now());
        }
      }
      const callChannel = (data?.call_channel || "").toString().trim();
      const fallbackSession = {
        duration_minutes: typeof session === "object" ? session?.duration_minutes : null,
      };
      if (data?.session || fallbackSession.duration_minutes) {
        setCallTiming(resolveCallTiming({ ...fallbackSession, ...data?.session }));
      }
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: "Opening session…",
        },
      }));
      await startSessionCall(sessionId, sessionType, {
        session: { ...fallbackSession, ...data?.session },
        label: peerLabel,
        channelName: callChannel || `vr-call-${sessionId}`,
      });
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

  const endReasonOptions = [
    { value: "completed_early", label: "Ended early (both agreed)" },
    { value: "connection_issue", label: "Connection issues" },
    { value: "screen_recording_detected", label: "Screen recording attempt detected" },
    { value: "client_no_show", label: "Client no-show" },
    { value: "model_no_show", label: "Model no-show" },
    { value: "safety_concern", label: "Safety / comfort concern" },
    { value: "other", label: "Other" },
  ];

  const submitCallEnd = async ({ reason, note, auto = false }) => {
    if (!callState.sessionId || !initData) {
      cleanupCall(true);
      return;
    }
    try {
      if (!auto) {
        setCallEndDialog((prev) => ({ ...prev, sending: true, status: "" }));
      }
      const res = await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          session_id: callState.sessionId,
          reason,
          note,
          auto,
          idempotency_key: getSessionActionIdempotencyKey(
            `session_end:${reason || "unknown"}`,
            callState.sessionId
          ),
        }),
      });
      if (!res.ok) {
        const { code } = await parseApiErrorPayload(res);
        const message = mapApiError({
          area: "sessions/end",
          status: res.status,
          code,
          fallback: `Unable to end call (HTTP ${res.status}).`,
        });
        if (!auto) {
          setCallEndDialog((prev) => ({ ...prev, status: message, sending: false }));
        } else {
          showCallToast("Session ended.", "warn");
        }
        cleanupCall(true);
        return;
      }
      if (!auto) {
        setCallEndDialog({ open: false, reason: "", note: "", status: "", sending: false });
      }
      const isTimeElapsed = reason === "time_elapsed";
      if (isTimeElapsed) {
        sendCallSignal({ type: "session-ended", reason }).catch(() => null);
        showCallConclusion("Thanks for spending time here. Your session has concluded.");
        await refreshBookings();
        await refreshProfile();
        cleanupCall(false, false);
        return;
      }
      showCallToast("Session ended.", "neutral");
      await refreshBookings();
      await refreshProfile();
      cleanupCall(true);
    } catch {
      if (!auto) {
        setCallEndDialog((prev) => ({
          ...prev,
          status: "Unable to end call. Try again.",
          sending: false,
        }));
      }
      cleanupCall(true);
    }
  };

  const handleAutoCallEnd = () => {
    if (!callState.open || callState.sessionType === "chat") {
      cleanupCall(true);
      return;
    }
    submitCallEnd({ reason: "time_elapsed", note: "timer_complete", auto: true });
  };

  const requestEndCall = () => {
    if (callCountdown.remaining == null || callCountdown.remaining > 0) {
      setCallEndDialog({ open: true, reason: "", note: "", status: "", sending: false });
      return;
    }
    submitCallEnd({ reason: "time_elapsed", note: "user_end", auto: true });
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
        const { code } = await parseApiErrorPayload(res);
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: mapApiError({
              area: "sessions/confirm",
              status: res.status,
              code,
              fallback: `Unable to confirm session (HTTP ${res.status}).`,
            }),
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
      await refreshProfile();
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
        body: JSON.stringify({
          initData,
          session_id: sessionId,
          idempotency_key: getSessionActionIdempotencyKey("session_cancel", sessionId),
        }),
      });
      if (!res.ok) {
        const { code } = await parseApiErrorPayload(res);
        setSessionActionStatus((prev) => ({
          ...prev,
          [sessionId]: {
            loading: false,
            error: mapApiError({
              area: "sessions/cancel",
              status: res.status,
              code,
              fallback: `Unable to cancel session (HTTP ${res.status}).`,
            }),
            info: "",
          },
        }));
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const nextStatus = payload?.status || "disputed";
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: "Session cancelled. Moved to dispute review.",
        },
      }));
      setClientSessions((prev) =>
        prev.map((item) =>
          item.id === sessionId ? { ...item, status: nextStatus } : item
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

  const requestSessionCancel = (sessionId) => {
    openConfirmDialog({
      title: "Cancel this session?",
      message:
        "This action is final. The session will be moved straight to dispute and cannot be rejoined.",
      confirmText: "Yes, cancel",
      danger: true,
      action: { type: "session_cancel", sessionId },
    });
  };

  const requestModelSessionCancel = (sessionId) => {
    openConfirmDialog({
      title: "Cancel this booking?",
      message:
        "This action is final. The booking will be moved straight to dispute and cannot be rejoined.",
      confirmText: "Yes, cancel",
      danger: true,
      action: { type: "model_session_cancel", sessionId },
    });
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
        const { code } = await parseApiErrorPayload(res);
        setDisputeState((prev) => ({
          ...prev,
          loading: false,
          status: mapApiError({
            area: "sessions/dispute",
            status: res.status,
            code,
            fallback: `Dispute failed (HTTP ${res.status}).`,
          }),
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
      if (ageGateConfirmed) {
        setRole("client");
      } else if (!ageGateOpen) {
        setAgeGateTargetRole("client");
        setAgeGateStatus("");
        setAgeGateOpen(true);
      }
    }
  }, [contentId, modelId, roleLocked, ageGateConfirmed, ageGateOpen]);

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
    const stored = window.localStorage.getItem(AGE_GATE_STORAGE_KEY);
    if (stored === "1") {
      setAgeGateConfirmed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const locked = window.localStorage.getItem("vr_role_locked");
    if (stored === ONBOARDING_VERSION && locked === "1") {
      setOnboardingComplete(true);
    }
  }, []);

  useEffect(() => {
    if (!clientLocationDirty && clientForm.location) {
      return;
    }
    setClientForm((prev) =>
      prev.location === clientLocationValue ? prev : { ...prev, location: clientLocationValue }
    );
  }, [clientLocationValue, clientLocationDirty, clientForm.location]);

  useEffect(() => {
    if (clientLocationDirty) {
      return;
    }
    if (!clientForm.location) {
      return;
    }
    const parsed = parseLocation(clientForm.location);
    if (parsed.countryIso && parsed.countryIso !== clientCountryIso) {
      setClientCountryIso(parsed.countryIso);
    }
    if (parsed.regionName !== clientRegionName) {
      setClientRegionName(parsed.regionName);
    }
  }, [clientForm.location, clientLocationDirty, clientCountryIso, clientRegionName]);

  useEffect(() => {
    if (!modelLocationDirty && modelForm.location) {
      return;
    }
    setModelForm((prev) =>
      prev.location === modelLocationValue ? prev : { ...prev, location: modelLocationValue }
    );
  }, [modelLocationValue, modelLocationDirty, modelForm.location]);

  useEffect(() => {
    if (modelLocationDirty) {
      return;
    }
    if (!modelForm.location) {
      return;
    }
    const parsed = parseLocation(modelForm.location);
    if (parsed.countryIso && parsed.countryIso !== modelCountryIso) {
      setModelCountryIso(parsed.countryIso);
    }
    if (parsed.regionName !== modelRegionName) {
      setModelRegionName(parsed.regionName);
    }
  }, [modelForm.location, modelLocationDirty, modelCountryIso, modelRegionName]);

  useEffect(() => {
    if (!profileLocationDirty && profileEditForm.location) {
      return;
    }
    setProfileEditForm((prev) =>
      prev.location === profileLocationValue ? prev : { ...prev, location: profileLocationValue }
    );
  }, [profileLocationValue, profileLocationDirty, profileEditForm.location]);

  useEffect(() => {
    if (!avatarState.file) {
      setAvatarPreviewUrl("");
      setAvatarImageMeta({ width: 0, height: 0 });
      setAvatarCrop({ scale: 1, x: 0, y: 0 });
      return;
    }
    const url = URL.createObjectURL(avatarState.file);
    setAvatarPreviewUrl(url);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      setAvatarImageMeta({ width, height });
      const scale = Math.max(AVATAR_CROP_SIZE / width, AVATAR_CROP_SIZE / height);
      const x = (AVATAR_CROP_SIZE - width * scale) / 2;
      const y = (AVATAR_CROP_SIZE - height * scale) / 2;
      setAvatarCrop({ scale, x, y });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [avatarState.file]);

  useEffect(() => {
    return () => {
      cleanupCall(false, false);
    };
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
    if (!initData) {
      return;
    }
    if (pageVisible) {
      loadNotifications(true).catch(() => null);
    }
    const interval = setInterval(() => {
      if (!pageVisible) {
        return;
      }
      loadNotifications(true).catch(() => null);
    }, 30000);
    return () => clearInterval(interval);
  }, [initData, pageVisible]);

  useEffect(() => {
    if (!initData) {
      return undefined;
    }
    const ping = () => {
      if (!pageVisible) {
        return;
      }
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      }).catch(() => null);
    };
    if (pageVisible) {
      ping();
    }
    const interval = setInterval(ping, 20000);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        ping();
      }
    };
    const onFocus = () => ping();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [initData, pageVisible]);

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

  const loadGalleryPage = async (page = 0, append = false) => {
    if (!initData || role !== "client") {
      return;
    }
    if (page === 0) {
      setGalleryLoading(true);
      setGalleryStatus("");
    } else {
      setGalleryLoadingMore(true);
    }
    try {
      const res = await fetch(
        `/api/content?limit=${GALLERY_PAGE_SIZE}&offset=${page * GALLERY_PAGE_SIZE}`,
        {
          headers: { "x-telegram-init": initData },
          cache: "no-store",
        }
      );
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
          const { code } = await parseApiErrorPayload(res);
          setGalleryStatus(
            mapApiError({
              area: "content/list",
              status: res.status,
              code,
              fallback: `Gallery unavailable (HTTP ${res.status}).`,
            })
          );
        }
        if (page === 0) {
          setGalleryItems([]);
          setGalleryHasMore(false);
        }
        setGalleryLoading(false);
        setGalleryLoadingMore(false);
        return;
      }
      const data = await res.json();
      setGalleryItems((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      setGalleryHasMore(Boolean(data?.has_more));
      setGalleryPage(page);
      setGalleryStatus("");
      markSynced("gallery");
      if (!clientAccessPaid) {
        setClientAccessPaid(true);
        setClientStep(3);
        setClientTab("gallery");
      }
      setGalleryLoading(false);
      setGalleryLoadingMore(false);
    } catch {
      setGalleryStatus("Gallery unavailable.");
      if (page === 0) {
        setGalleryItems([]);
        setGalleryHasMore(false);
      }
      setGalleryLoading(false);
      setGalleryLoadingMore(false);
    }
  };

  const loadClientSessionsPage = async (page = 0, append = false) => {
    if (!initData || role !== "client") {
      return;
    }
    if (page === 0) {
      setClientSessionsLoading(true);
      setClientSessionsStatus("");
    } else {
      setClientSessionsLoadingMore(true);
    }
    try {
      const res = await fetch(
        `/api/sessions?scope=client&limit=${SESSIONS_PAGE_SIZE}&offset=${
          page * SESSIONS_PAGE_SIZE
        }`,
        {
          headers: { "x-telegram-init": initData },
          cache: "no-store",
        }
      );
      if (!res.ok) {
        const { code } = await parseApiErrorPayload(res);
        setClientSessionsStatus(
          mapApiError({
            area: "sessions/list",
            status: res.status,
            code,
            fallback: `Unable to load sessions (HTTP ${res.status}).`,
          })
        );
        if (page === 0) {
          setClientSessions([]);
          setClientSessionsHasMore(false);
        }
        setClientSessionsLoading(false);
        setClientSessionsLoadingMore(false);
        return;
      }
      const data = await res.json();
      setClientSessions((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      setClientSessionsHasMore(Boolean(data?.has_more));
      setClientSessionsPage(page);
      markSynced("client_sessions");
      setClientSessionsLoading(false);
      setClientSessionsLoadingMore(false);
    } catch {
      setClientSessionsStatus("Unable to load sessions.");
      if (page === 0) {
        setClientSessions([]);
        setClientSessionsHasMore(false);
      }
      setClientSessionsLoading(false);
      setClientSessionsLoadingMore(false);
    }
  };

  const loadBookingsPage = async (page = 0, append = false) => {
    if (!initData || role !== "model" || !modelApproved) {
      return;
    }
    if (page === 0) {
      setMyBookingsLoading(true);
      setMyBookingsStatus("");
    } else {
      setMyBookingsLoadingMore(true);
    }
    try {
      const res = await fetch(
        `/api/sessions?scope=mine&limit=${SESSIONS_PAGE_SIZE}&offset=${
          page * SESSIONS_PAGE_SIZE
        }`,
        {
          headers: { "x-telegram-init": initData },
          cache: "no-store",
        }
      );
      if (!res.ok) {
        const { code } = await parseApiErrorPayload(res);
        setMyBookingsStatus(
          mapApiError({
            area: "sessions/mine",
            status: res.status,
            code,
            fallback: `Unable to load bookings (HTTP ${res.status}).`,
          })
        );
        if (page === 0) {
          setMyBookings([]);
          setMyBookingsHasMore(false);
        }
        setMyBookingsLoading(false);
        setMyBookingsLoadingMore(false);
        return;
      }
      const data = await res.json();
      setMyBookings((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      setMyBookingsHasMore(Boolean(data?.has_more));
      setMyBookingsPage(page);
      markSynced("bookings");
      setMyBookingsLoading(false);
      setMyBookingsLoadingMore(false);
    } catch {
      setMyBookingsStatus("Unable to load bookings.");
      if (page === 0) {
        setMyBookings([]);
        setMyBookingsHasMore(false);
      }
      setMyBookingsLoading(false);
      setMyBookingsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!initData || role !== "client") {
      return;
    }
    loadGalleryPage(0, false);
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

  const loadMoreGallery = async () => {
    if (galleryLoadingMore || !galleryHasMore) {
      return;
    }
    await loadGalleryPage(galleryPage + 1, true);
  };

  const loadMoreClientSessions = async () => {
    if (clientSessionsLoadingMore || !clientSessionsHasMore) {
      return;
    }
    await loadClientSessionsPage(clientSessionsPage + 1, true);
  };

  const loadMoreBookings = async () => {
    if (myBookingsLoadingMore || !myBookingsHasMore) {
      return;
    }
    await loadBookingsPage(myBookingsPage + 1, true);
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
    loadClientSessionsPage(0, false);
  }, [initData, role, clientTab]);

  useEffect(() => {
    if (!initData || role !== "client" || clientTab !== "sessions") {
      return;
    }
    const interval = setInterval(() => {
      loadClientSessionsPage(0, false);
    }, 20000);
    return () => clearInterval(interval);
  }, [initData, role, clientTab]);

  useEffect(() => {
    if (!initData || !pageVisible || role !== "model" || !modelApproved) {
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
    if (
      !initData ||
      !pageVisible ||
      role !== "client" ||
      !clientAccessPaid ||
      clientTab !== "gallery"
    ) {
      return;
    }
    const interval = setInterval(() => {
      setGalleryRefreshKey((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [initData, pageVisible, role, clientAccessPaid, clientTab]);

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
        markSynced("earnings");
      } catch {
        setModelEarningsStatus("Unable to load earnings.");
        setModelEarnings(null);
      }
    };
    loadEarnings();
  }, [initData, pageVisible, role, modelApproved, modelTab]);

  useEffect(() => {
    if (!initData || role !== "model" || !modelApproved) {
      return;
    }
    let intervalId = null;
    if (modelTab === "sessions") {
      refreshBookings();
    }
    if (modelTab === "followers") {
      const loadFollowers = async () => {
        setFollowersStatus("");
        setFollowersStats(null);
        try {
          const res = await fetch("/api/followers", {
            headers: { "x-telegram-init": initData },
          });
          if (!res.ok) {
            setFollowersStatus(`Unable to load followers (HTTP ${res.status}).`);
            setFollowers([]);
            setFollowersStats(null);
            return;
          }
          const data = await res.json();
          setFollowers(data.items || []);
          setFollowersStats(data.stats || null);
          markSynced("followers");
        } catch {
          setFollowersStatus("Unable to load followers.");
          setFollowers([]);
          setFollowersStats(null);
        }
      };
      loadFollowers();
      intervalId = setInterval(loadFollowers, 20000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [initData, role, modelApproved, modelTab]);

  useEffect(() => {
    if (!initData || !pageVisible || role !== "client" || clientTab !== "following") {
      return;
    }
    const loadFollowing = async () => {
      setFollowingLoading(true);
      setFollowingStatus("");
      try {
        const res = await fetch("/api/following", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          setFollowingStatus(`Unable to load follows (HTTP ${res.status}).`);
          setFollowing([]);
          setFollowingLoading(false);
          return;
        }
        const data = await res.json();
        setFollowing(data.items || []);
        markSynced("following");
        setFollowingLoading(false);
      } catch {
        setFollowingStatus("Unable to load follows.");
        setFollowing([]);
        setFollowingLoading(false);
      }
    };
    loadFollowing();
    const interval = setInterval(loadFollowing, 20000);
    return () => clearInterval(interval);
  }, [initData, pageVisible, role, clientTab]);

  useEffect(() => {
    if (!initData) {
      return;
    }
    const loadProfile = async () => {
      try {
        await fetch("/api/me/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        }).catch(() => null);
        const res = await fetch("/api/me", {
          headers: { "x-telegram-init": initData },
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setClientStatus(
              "Unable to verify Telegram session. Check BOT_TOKEN in your server env."
            );
          }
          return;
        }
        const data = await res.json();
        if (!data?.user) {
          setProfile(null);
          setRoleLocked(false);
          setLockedRole(null);
          setRole(null);
          setOnboardingComplete(false);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("vr_role");
            window.localStorage.removeItem("vr_role_locked");
            window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
          }
          return;
        }
        setProfile(data);
        markSynced("profile");
        if (data.user.role === "model") {
          setRoleLocked(true);
          setLockedRole("model");
          setRole("model");
          if (typeof window !== "undefined") {
            window.localStorage.setItem("vr_role", "model");
            window.localStorage.setItem("vr_role_locked", "1");
            window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
          }
          setOnboardingComplete(true);
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
          if (data.model?.bio) {
            setModelForm((prev) => ({ ...prev, bio: data.model.bio }));
          }
          if (data.model?.location) {
            setModelForm((prev) => ({ ...prev, location: data.model.location }));
            setModelLocationDirty(false);
          }
          if (data.model?.tags) {
            setModelForm((prev) => ({ ...prev, tags: data.model.tags }));
          }
          if (data.model?.availability) {
            setModelForm((prev) => ({ ...prev, availability: data.model.availability }));
          }
          if (data.user?.email) {
            setModelForm((prev) => ({ ...prev, email: data.user.email }));
          }
        } else if (data.user.role === "client") {
          setRoleLocked(true);
          setLockedRole("client");
          setRole("client");
          if (typeof window !== "undefined") {
            window.localStorage.setItem("vr_role", "client");
            window.localStorage.setItem("vr_role_locked", "1");
            window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
          }
          setOnboardingComplete(true);
          if (data.client?.access_fee_paid) {
            setClientStep(3);
            setClientTab("gallery");
          } else if (data.client) {
            setClientStep(2);
          }
          if (data.client?.display_name) {
            setClientForm((prev) => ({ ...prev, displayName: data.client.display_name }));
          }
          if (data.client?.location) {
            setClientForm((prev) => ({ ...prev, location: data.client.location }));
            setClientLocationDirty(false);
          }
          if (data.client?.birth_month) {
            setClientForm((prev) => ({ ...prev, birthMonth: String(data.client.birth_month) }));
          }
          if (data.client?.birth_year) {
            setClientForm((prev) => ({ ...prev, birthYear: String(data.client.birth_year) }));
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
    if (!initData || !role) {
      return;
    }
    if (role === "client" && clientTab === "profile") {
      fetchBlockedList();
      return;
    }
    if (role === "model" && modelTab === "profile") {
      fetchBlockedList();
    }
  }, [initData, role, clientTab, modelTab]);

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
      markSynced("wallet");
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
    setGalleryPage(0);
    setGalleryRefreshKey((prev) => prev + 1);
    await checkGalleryMembership();
  };

  const refreshModelStatus = async () => {
    if (!initData) {
      return;
    }
    try {
      await fetch("/api/me/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      }).catch(() => null);
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
      markSynced("profile");
    } catch {
      setModelStatus("Unable to refresh verification status.");
    }
  };

  const refreshProfile = async () => {
    if (!initData) {
      return;
    }
    try {
      await fetch("/api/me/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      }).catch(() => null);
      const res = await fetch("/api/me", {
        headers: { "x-telegram-init": initData },
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setProfile(data);
      markSynced("profile");
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

  const clampAvatarCrop = (next) => {
    if (!avatarImageMeta.width || !avatarImageMeta.height) {
      return next;
    }
    const scaledW = avatarImageMeta.width * next.scale;
    const scaledH = avatarImageMeta.height * next.scale;
    const minX = AVATAR_CROP_SIZE - scaledW;
    const minY = AVATAR_CROP_SIZE - scaledH;
    return {
      ...next,
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y)),
    };
  };

  const handleAvatarDragStart = (event) => {
    if (!avatarPreviewUrl) {
      return;
    }
    event.preventDefault();
    avatarDragRef.current.dragging = true;
    avatarDragRef.current.startX = event.clientX;
    avatarDragRef.current.startY = event.clientY;
    avatarDragRef.current.originX = avatarCrop.x;
    avatarDragRef.current.originY = avatarCrop.y;
  };

  const handleAvatarDragMove = (event) => {
    if (!avatarDragRef.current.dragging) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - avatarDragRef.current.startX;
    const deltaY = event.clientY - avatarDragRef.current.startY;
    setAvatarCrop((prev) =>
      clampAvatarCrop({
        ...prev,
        x: avatarDragRef.current.originX + deltaX,
        y: avatarDragRef.current.originY + deltaY,
      })
    );
  };

  const handleAvatarDragEnd = () => {
    avatarDragRef.current.dragging = false;
  };

  const handleAvatarZoomChange = (value) => {
    const nextScale = Number(value);
    setAvatarCrop((prev) => {
      if (!avatarImageMeta.width || !avatarImageMeta.height) {
        return prev;
      }
      const centerX = prev.x + (avatarImageMeta.width * prev.scale) / 2;
      const centerY = prev.y + (avatarImageMeta.height * prev.scale) / 2;
      const nextX = centerX - (avatarImageMeta.width * nextScale) / 2;
      const nextY = centerY - (avatarImageMeta.height * nextScale) / 2;
      return clampAvatarCrop({ scale: nextScale, x: nextX, y: nextY });
    });
  };

  const createCroppedAvatarFile = async () => {
    if (!avatarPreviewUrl || !avatarImageMeta.width || !avatarImageMeta.height) {
      return avatarState.file;
    }
    const img = new Image();
    img.src = avatarPreviewUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return avatarState.file;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scaleFactor = canvas.width / AVATAR_CROP_SIZE;
    ctx.drawImage(
      img,
      avatarCrop.x * scaleFactor,
      avatarCrop.y * scaleFactor,
      avatarImageMeta.width * avatarCrop.scale * scaleFactor,
      avatarImageMeta.height * avatarCrop.scale * scaleFactor
    );
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png", 0.92)
    );
    if (!blob) {
      return avatarState.file;
    }
    return new File([blob], avatarState.file?.name || "avatar.png", {
      type: "image/png",
    });
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
      const fileToUpload = await createCroppedAvatarFile();
      const uploadInit = await fetch("/api/profile/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          filename: fileToUpload?.name || avatarState.file.name,
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
      const uploadRes = await uploadToSignedUrl(
        payload.signed_url,
        fileToUpload || avatarState.file
      );
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
      if (creatorOverlay.creator?.model_id === modelId) {
        setCreatorOverlay((prev) => ({
          ...prev,
          creator: { ...prev.creator, is_following: Boolean(data.following) },
        }));
      }
      if (clientTab === "following" && !data.following) {
        setFollowing((prev) => prev.filter((creator) => creator.id !== modelId));
      }
      setFollowState((prev) => ({
        ...prev,
        [modelId]: { loading: false, error: "" },
      }));
      await refreshProfile();
      if (role === "client") {
        await refreshBookings();
      }
    } catch {
      setFollowState((prev) => ({
        ...prev,
        [modelId]: { loading: false, error: "Unable to update follow." },
      }));
    }
  };

  const toggleLike = async (contentId) => {
    if (!initData || !contentId) {
      return;
    }
    try {
      const res = await fetch("/api/content/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, content_id: contentId }),
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (!data?.ok) {
        return;
      }
      setGalleryItems((prev) =>
        prev.map((row) =>
          row.id === contentId
            ? {
                ...row,
                has_liked: Boolean(data.liked),
                likes_count:
                  typeof data.likes_count === "number" ? data.likes_count : row.likes_count,
                views_count:
                  typeof data.views_count === "number" ? data.views_count : row.views_count,
              }
            : row
        )
      );
      setPreviewOverlay((prev) =>
        prev.item?.id === contentId
          ? {
              ...prev,
              item: {
                ...prev.item,
                has_liked: Boolean(data.liked),
                likes_count:
                  typeof data.likes_count === "number" ? data.likes_count : prev.item.likes_count,
                views_count:
                  typeof data.views_count === "number" ? data.views_count : prev.item.views_count,
              },
            }
          : prev
      );
      await refreshProfile();
    } catch {
      // ignore
    }
  };

  const toggleSaved = (contentId) => {
    if (!contentId) {
      return;
    }
    setSavedGalleryIds((prev) => {
      if (prev.includes(contentId)) {
        return prev.filter((id) => id !== contentId);
      }
      return [...prev, contentId];
    });
  };

  const performBlockToggle = async (targetId) => {
    if (!initData || !targetId) {
      return;
    }
    setBlockState((prev) => ({
      ...prev,
      [targetId]: { loading: true, error: "" },
    }));
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, target_id: targetId }),
      });
      if (!res.ok) {
        setBlockState((prev) => ({
          ...prev,
          [targetId]: { loading: false, error: "Unable to update block." },
        }));
        return;
      }
      const data = await res.json();
      if (data.blocked) {
        setGalleryItems((prev) => prev.filter((item) => item.model_id !== targetId));
        setFollowing((prev) => prev.filter((creator) => creator.id !== targetId));
        if (creatorOverlay.creator?.model_id === targetId) {
          setCreatorOverlay({ open: false, creator: null });
        }
      }
      await refreshProfile();
      setBlockState((prev) => ({
        ...prev,
        [targetId]: { loading: false, error: "" },
      }));
    } catch {
      setBlockState((prev) => ({
        ...prev,
        [targetId]: { loading: false, error: "Unable to update block." },
      }));
    }
  };

  const openConfirmDialog = ({ title, message, confirmText, danger, action }) => {
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setProfileEditOpen(false);
    setConfirmDialog({
      open: true,
      title: title || "Confirm",
      message: message || "",
      confirmText: confirmText || "Confirm",
      danger: Boolean(danger),
      action: action || null,
      status: "",
      busy: false,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog((prev) => ({ ...prev, open: false, status: "", busy: false, action: null }));
  };

  const runConfirmAction = async () => {
    if (!confirmDialog.action) {
      closeConfirmDialog();
      return;
    }
    setConfirmDialog((prev) => ({ ...prev, busy: true, status: "" }));
    try {
      const action = confirmDialog.action;
      if (action.type === "block_toggle") {
        await performBlockToggle(action.targetId);
        await fetchBlockedList();
      } else if (action.type === "session_cancel") {
        await handleSessionCancel(action.sessionId);
      } else if (action.type === "model_session_cancel") {
        await handleBookingAction(action.sessionId, "cancel");
      } else if (action.type === "clear_report") {
        // noop
      }
      setConfirmDialog((prev) => ({ ...prev, busy: false }));
      closeConfirmDialog();
    } catch {
      setConfirmDialog((prev) => ({ ...prev, busy: false, status: "Action failed. Try again." }));
    }
  };

  const requestBlockToggle = (targetId, targetLabel) => {
    const currentlyBlocked = isBlocked(targetId);
    openConfirmDialog({
      title: currentlyBlocked ? "Unblock this user?" : "Block this user?",
      message: currentlyBlocked
        ? `Unblock ${targetLabel || "this user"}? You'll see their content again.`
        : `Block ${targetLabel || "this user"}? You won't see each other's content and you'll both be unfollowed.`,
      confirmText: currentlyBlocked ? "Unblock" : "Block",
      danger: !currentlyBlocked,
      action: { type: "block_toggle", targetId },
    });
  };

  const openReportDialog = (targetId, targetLabel, targetType = "user") => {
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog({
      open: true,
      targetId: targetType === "content" ? null : targetId,
      targetType,
      contentId: targetType === "content" ? targetId : null,
      targetLabel: targetLabel || "",
      selectedReason: "",
      expanded: "",
      details: "",
      status: "",
      submitting: false,
    });
  };

  const closeReportDialog = () => {
    setReportDialog((prev) => ({
      ...prev,
      open: false,
      submitting: false,
      status: "",
      targetType: "user",
      contentId: null,
      targetId: null,
    }));
  };

  const reportReasons = useMemo(() => {
    if (reportDialog.targetType === "content") {
      return [
        { key: "explicit", label: "Explicit content", desc: "Content that violates platform rules." },
        { key: "misleading", label: "Misleading", desc: "Misleading title/description or bait-and-switch." },
        { key: "stolen_content", label: "Stolen content", desc: "Posting content without rights/permission." },
        { key: "harassment", label: "Harassment", desc: "Targeted abuse within content or captions." },
        { key: "underage", label: "Underage concern", desc: "Anything that suggests a creator may be under 18." },
        { key: "other", label: "Other", desc: "Something else not listed." },
      ];
    }
    return [
      { key: "spam", label: "Spam", desc: "Mass messaging, repetitive links, or unwanted promotions." },
      { key: "harassment", label: "Harassment", desc: "Threats, hate speech, or targeted abuse." },
      { key: "impersonation", label: "Impersonation", desc: "Pretending to be someone else." },
      { key: "fraud", label: "Fraud / Scam", desc: "Payment deception, fake identity, or chargeback abuse." },
      { key: "stolen_content", label: "Stolen content", desc: "Posting content without rights/permission." },
      { key: "underage", label: "Underage concern", desc: "Anything that suggests a user may be under 18." },
      { key: "other", label: "Other", desc: "Something else not listed." },
    ];
  }, [reportDialog.targetType]);

  const submitReportDialog = async () => {
    if (reportDialog.targetType === "content" && !reportDialog.contentId) {
      return;
    }
    if (reportDialog.targetType !== "content" && !reportDialog.targetId) {
      return;
    }
    if (!reportDialog.selectedReason) {
      setReportDialog((prev) => ({ ...prev, status: "Select a reason to continue." }));
      return;
    }
    setReportDialog((prev) => ({ ...prev, submitting: true, status: "" }));
    const reasonLabel =
      reportReasons.find((item) => item.key === reportDialog.selectedReason)?.label ||
      reportDialog.selectedReason;
    const details = (reportDialog.details || "").trim();
    const payloadReason = details ? `${reasonLabel}: ${details}` : reasonLabel;
    const ok = await reportCreator({
      targetId: reportDialog.targetId,
      contentId: reportDialog.contentId,
      targetType: reportDialog.targetType,
      reason: payloadReason,
    });
    if (ok) {
      setReportDialog((prev) => ({ ...prev, submitting: false, status: "Report submitted ✅" }));
      setTimeout(() => closeReportDialog(), 600);
      return;
    }
    setReportDialog((prev) => ({ ...prev, submitting: false }));
  };

  const fetchBlockedList = async () => {
    if (!initData) {
      return;
    }
    setBlockedListLoading(true);
    setBlockedListStatus("");
    try {
      const res = await fetch("/api/block", { headers: { "x-telegram-init": initData } });
      if (!res.ok) {
        setBlockedListStatus(`Unable to load blocklist (HTTP ${res.status}).`);
        setBlockedListLoading(false);
        return;
      }
      const data = await res.json();
      setBlockedList(Array.isArray(data.blocked) ? data.blocked : []);
      setBlockedListLoading(false);
    } catch {
      setBlockedListStatus("Unable to load blocklist.");
      setBlockedListLoading(false);
    }
  };

  const updatePrivacy = async (next) => {
    if (!initData) {
      return;
    }
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            user: {
              ...prev.user,
              privacy_hide_email: next.hideEmail,
              privacy_hide_location: next.hideLocation,
            },
          }
        : prev
    );
    try {
      const res = await fetch("/api/profile/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          hide_email: next.hideEmail,
          hide_location: next.hideLocation,
        }),
      });
      if (!res.ok) {
        return;
      }
      await refreshProfile();
    } catch {
      // ignore
    }
  };

  const openCreator = (item) => {
    const modelId = item?.model_id || item?.id || null;
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setCreatorOverlay({ open: true, creator: { ...item, model_id: modelId } });
  };

  const closeCreator = () => {
    setCreatorOverlay({ open: false, creator: null });
  };

  const reportCreator = async ({ targetId, contentId, targetType = "user", reason = "" }) => {
    if (!initData || (targetType === "content" ? !contentId : !targetId)) {
      return false;
    }
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          target_id: targetId,
          target_type: targetType,
          content_id: contentId,
          reason,
        }),
      });
      if (res.ok) {
        setClientStatus("Report submitted. Admin will review.");
        return true;
      }
      setClientStatus("Report failed. Try again.");
      return false;
    } catch {
      setClientStatus("Report failed. Try again.");
      return false;
    }
  };

  const openProfileEdit = () => {
    const user = profile?.user || {};
    const client = profile?.client || {};
    const model = profile?.model || {};
    const locationValue = role === "model" ? model.location || "" : client.location || "";
    const parsedLocation = parseLocation(locationValue);
    setProfileEditForm({
      username: client.display_name || user.username || "",
      email: user.email || "",
      location: locationValue,
      birthMonth: client.birth_month ? String(client.birth_month) : "",
      birthYear: client.birth_year ? String(client.birth_year) : "",
      stageName: model.display_name || "",
      bio: model.bio || "",
      tags: Array.isArray(model.tags) ? model.tags.join(", ") : (model.tags || ""),
      availability: model.availability || "",
    });
    setProfileCountryIso(parsedLocation.countryIso || "");
    setProfileRegionName(parsedLocation.regionName || "");
    setProfileLocationDirty(false);
    setProfileEditStatus("");
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setProfileEditOpen(true);
  };

  const closeProfileEdit = () => {
    setProfileEditOpen(false);
    setProfileEditStatus("");
    setProfileEditSaving(false);
    setProfileLocationDirty(false);
  };

  const saveProfileEdit = async () => {
    if (!initData) {
      setProfileEditStatus("Open this mini app inside Telegram to save changes.");
      return;
    }
    setProfileEditSaving(true);
    setProfileEditStatus("");
    try {
      const resolvedLocation = profileLocationValue || profileEditForm.location;
      const payload = { initData };
      if (role === "client") {
        payload.display_name = profileEditForm.username;
        payload.username = profileEditForm.username;
        payload.email = profileEditForm.email;
        payload.location = resolvedLocation;
        payload.birth_month = profileEditForm.birthMonth;
        payload.birth_year = profileEditForm.birthYear;
      } else if (role === "model") {
        payload.display_name = profileEditForm.stageName;
        payload.email = profileEditForm.email;
        payload.location = resolvedLocation;
        payload.bio = profileEditForm.bio;
        payload.availability = profileEditForm.availability;
        payload.tags = profileEditForm.tags
          .split(",")
          .map((val) => val.trim())
          .filter(Boolean);
      }
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "username_taken") {
          setProfileEditStatus("That username is taken. Try another.");
        } else if (data?.error === "age_restricted") {
          setProfileEditStatus("18+ required. Please check your birth month/year.");
        } else if (data?.error === "role_locked") {
          setProfileEditStatus("This account is locked to a different role.");
        } else {
          setProfileEditStatus(`Save failed (HTTP ${res.status}).`);
        }
        setProfileEditSaving(false);
        return;
      }
      await refreshProfile();
      setProfileEditSaving(false);
      setProfileEditStatus("Saved ✓");
      setProfileSavedStatus("Profile saved ✓");
      setTimeout(() => setProfileSavedStatus(""), 2500);
      setTimeout(() => closeProfileEdit(), 700);
    } catch {
      setProfileEditSaving(false);
      setProfileEditStatus("Save failed. Try again.");
    }
  };

  const proceedRoleSelection = (nextRole) => {
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

  const openAgeGate = (nextRole) => {
    setAgeGateTargetRole(nextRole);
    setAgeGateStatus("");
    setAgeGateOpen(true);
  };

  const closeAgeGate = () => {
    setAgeGateOpen(false);
    setAgeGateTargetRole(null);
  };

  const confirmAgeGate = (confirmed) => {
    if (!confirmed) {
      setAgeGateStatus("You must be 18+ to use Velvet Rooms.");
      return;
    }
    setAgeGateConfirmed(true);
    setClientErrors((prev) => ({ ...prev, ageGate: "" }));
    setModelErrors((prev) => ({ ...prev, ageGate: "" }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AGE_GATE_STORAGE_KEY, "1");
    }
    setAgeGateOpen(false);
    if (ageGateTargetRole) {
      const nextRole = ageGateTargetRole;
      setAgeGateTargetRole(null);
      proceedRoleSelection(nextRole);
    }
  };

  const handleRole = (nextRole) => {
    if (!ageGateConfirmed) {
      openAgeGate(nextRole);
      return;
    }
    proceedRoleSelection(nextRole);
  };

  const finishOnboarding = () => {
    setOnboardingComplete(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const advanceOnboarding = () => {
    if (onboardingStep >= onboardingTotal - 1) {
      finishOnboarding();
      return;
    }
    setOnboardingStep((prev) => Math.min(prev + 1, onboardingTotal - 1));
  };

  const retreatOnboarding = () => {
    setOnboardingStep((prev) => Math.max(prev - 1, 0));
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
    const modelId = Number(item?.model_id || 0);
    if (!modelId) {
      setClientStatus("Booking unavailable for this item.");
      return;
    }
    const defaultType = "video";
    const defaultDuration = 10;
    const price = getSessionPrice(defaultType, defaultDuration);
    const defaultSchedule = scheduleMin;
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setBookingSheet({
      open: true,
      modelId,
      modelName:
        item.display_name || item.model_label || item.public_id || item.model_public_id || "Model",
      sessionType: defaultType,
      duration: defaultDuration,
      price: price || 0,
      status: "",
      paymentMethod: "flutterwave",
      scheduledFor: defaultSchedule,
      loading: false,
    });
  };

  const renderLocationFields = ({
    countryIso,
    regionName,
    regionData,
    onCountryChange,
    onRegionChange,
    idPrefix,
  }) => {
    const regionLabel = regionData.kind === "state" ? "State / Region" : "City / Region";
    const regionPlaceholder = regionData.items.length
      ? `Select ${regionData.kind === "state" ? "state/region" : "city/region"}`
      : "Select country first";
    return (
      <div className="field-row">
        <label className="field" htmlFor={`${idPrefix}-country`}>
          Country
          <select
            id={`${idPrefix}-country`}
            value={countryIso}
            onChange={(event) => {
              onCountryChange(event.target.value);
              onRegionChange("");
            }}
          >
            <option value="">Select country</option>
            {countries.map((country) => (
              <option key={`${idPrefix}-country-${country.isoCode}`} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${idPrefix}-region`}>
          {regionLabel}
          <select
            id={`${idPrefix}-region`}
            value={regionName}
            onChange={(event) => onRegionChange(event.target.value)}
            disabled={!countryIso || regionData.items.length === 0}
          >
            <option value="">{regionPlaceholder}</option>
            {regionData.items.map((region) => (
              <option key={`${idPrefix}-region-${region}`} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  const openExtension = (session) => {
    const price = getExtensionPrice(session.session_type);
    if (!price) {
      setClientStatus("Extensions are available for video or voice sessions only.");
      return;
    }
    setNotifications((prev) => ({ ...prev, open: false }));
    setPreviewOverlay((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
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
    const previewUrl = item.preview_url || item.preview_thumb_url;
    if (!previewUrl) {
      setGalleryStatus("Preview unavailable. It may be under moderation, removed, or expired.");
      return;
    }
    setNotifications((prev) => ({ ...prev, open: false }));
    setCreatorOverlay((prev) => ({ ...prev, open: false }));
    setBookingSheet((prev) => ({ ...prev, open: false }));
    setExtensionSheet((prev) => ({ ...prev, open: false }));
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setReportDialog((prev) => ({ ...prev, open: false }));
    setGalleryStatus("");
    setConsumedTeasers((prev) => ({ ...prev, [item.id]: true }));
    setPreviewOverlay({
      open: true,
      item: { ...item, preview_url: previewUrl },
      remaining: Math.ceil(teaserViewMs / 1000),
    });
    // Record a unique view for engagement metrics (best-effort).
    if (initData) {
      fetch("/api/content/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, content_id: item.id }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.ok) {
            return;
          }
          setGalleryItems((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    views_count:
                      typeof data.views_count === "number" ? data.views_count : row.views_count,
                    likes_count:
                      typeof data.likes_count === "number" ? data.likes_count : row.likes_count,
                  }
                : row
            )
          );
          setPreviewOverlay((prev) =>
            prev.item?.id === item.id
              ? {
                  ...prev,
                  item: {
                    ...prev.item,
                    views_count:
                      typeof data.views_count === "number" ? data.views_count : prev.item.views_count,
                    likes_count:
                      typeof data.likes_count === "number" ? data.likes_count : prev.item.likes_count,
                  },
                }
              : prev
          );
        })
        .catch(() => {});
    }
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
    const idempotencyKey = getPaymentInitIdempotencyKey({ mode, contentId, session });
    try {
      const res = await fetch("/api/payments/flutterwave/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          initData,
          idempotency_key: idempotencyKey,
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
        const message =
          data?.error === "idempotency_in_progress"
            ? "Payment request is still processing. Please wait a moment."
            : data?.error
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
    const idempotencyKey = getPaymentInitIdempotencyKey({ mode, contentId, session });
    payload.idempotency_key = idempotencyKey;
    try {
      const res = await fetch("/api/payments/crypto/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          data?.error === "idempotency_in_progress"
            ? "Payment request is still processing. Please wait a moment."
            : data?.error
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

  const startWalletPayment = async ({ mode, session = null, onError }) => {
    if (!initData) {
      const message = "Open this mini app inside Telegram to proceed.";
      if (onError) {
        onError(message);
      } else {
        setClientStatus(message);
      }
      return false;
    }
    const idempotencyKey = getWalletIdempotencyKey(mode, session);
    try {
      const res = await fetch("/api/payments/wallet/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          initData,
          escrow_type: mode,
          idempotency_key: idempotencyKey,
          model_id: session?.modelId,
          session_type: session?.sessionType,
          duration_minutes: session?.duration,
          scheduled_for: session?.scheduledFor,
          session_id: session?.sessionId,
          extension_minutes: session?.extensionMinutes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          data?.error === "insufficient_wallet"
            ? "Wallet balance is too low."
            : data?.error
            ? `Wallet payment failed: ${data.error}`
            : `Wallet payment failed (HTTP ${res.status}).`;
        if (onError) {
          onError(message);
        } else {
          setClientStatus(message);
        }
        return false;
      }
      await refreshProfile();
      if (idempotencyKey) {
        const key = `${mode}:${session?.sessionId || session?.modelId || "access"}`;
        delete walletIdempotencyRef.current[key];
      }
      return true;
    } catch {
      const message = "Wallet payment failed. Try again.";
      if (onError) {
        onError(message);
      } else {
        setClientStatus(message);
      }
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
        await refreshBookings();
        await refreshProfile();
      }
      return;
    }
    if (extensionSheet.paymentMethod === "wallet") {
      const ok = await startWalletPayment({
        mode: "extension",
        session: sessionPayload,
        onError,
      });
      if (ok) {
        setExtensionSheet((prev) => ({ ...prev, open: false, loading: false }));
        await refreshBookings();
        await refreshProfile();
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
      await refreshBookings();
      await refreshProfile();
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
        await refreshBookings();
        await refreshProfile();
      }
      return;
    }
    if (bookingSheet.paymentMethod === "wallet") {
      const ok = await startWalletPayment({
        mode: "session",
        session: sessionPayload,
        onError,
      });
      if (ok) {
        setBookingSheet((prev) => ({ ...prev, open: false, loading: false }));
        await refreshBookings();
        await refreshProfile();
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
      await refreshBookings();
      await refreshProfile();
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
      if (paymentState.mode === "access") {
        await refreshClientAccess(true);
      } else if (paymentState.mode === "session" || paymentState.mode === "extension") {
        await refreshBookings();
      }
      await refreshProfile();
    } catch {
      setPaymentState((prev) => ({
        ...prev,
        submitting: false,
        status: "Submission failed. Try again.",
      }));
    }
  };

  const updateClientField = (field, value) => {
    setClientForm((prev) => ({ ...prev, [field]: value }));
    setClientErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const updateModelField = (field, value) => {
    setModelForm((prev) => ({ ...prev, [field]: value }));
    setModelErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleClientNext = async () => {
    if (clientStep === 1) {
      const errors = {};
      if (!clientForm.displayName) {
        errors.displayName = "Display name is required.";
      }
      if (!clientForm.email) {
        errors.email = "Email is required.";
      }
      if (!clientCountryIso) {
        errors.country = "Select your country.";
      }
      if (clientRegionData.items.length && !clientRegionName) {
        errors.region = "Select your city/region.";
      }
      if (!clientForm.birthMonth) {
        errors.birthMonth = "Select your birth month.";
      }
      if (!clientForm.birthYear) {
        errors.birthYear = "Select your birth year.";
      }
      if (!ageGateConfirmed) {
        errors.ageGate = "Confirm you are 18+ to continue.";
      }
      if (!clientForm.disclaimerAccepted) {
        errors.disclaimer = "You must accept the agreement.";
      }
      if (Object.keys(errors).length > 0) {
        setClientErrors(errors);
        if (!ageGateConfirmed) {
          openAgeGate("client");
        }
        setClientStatus("Please fix the highlighted fields.");
        return;
      }
      const ageCheck = isAdult(clientForm.birthYear, clientForm.birthMonth);
      if (!ageCheck.ok) {
        setClientErrors({ birthYear: ageCheck.message });
        setClientStatus(ageCheck.message);
        return;
      }
      setClientErrors({});
    }
    if (clientStep === 1) {
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
            location: clientLocationValue,
            birth_month: clientForm.birthMonth,
            birth_year: clientForm.birthYear,
            disclaimer_accepted: clientForm.disclaimerAccepted,
            disclaimer_version: DISCLAIMER_VERSION,
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
            } else if (payload?.error === "missing_location") {
              errorMsg = "Add your location to continue.";
            } else if (payload?.error === "disclaimer_required") {
              errorMsg = "You must accept the agreement to continue.";
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
        await refreshProfile();
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
    if (modelStep === 1) {
      const errors = {};
      if (!modelForm.stageName) {
        errors.stageName = "Stage name is required.";
      }
      if (!modelCountryIso) {
        errors.country = "Select your country.";
      }
      if (modelRegionData.items.length && !modelRegionName) {
        errors.region = "Select your city/region.";
      }
      if (!modelForm.availability) {
        errors.availability = "Select your availability.";
      }
      if (!modelForm.birthMonth) {
        errors.birthMonth = "Select your birth month.";
      }
      if (!modelForm.birthYear) {
        errors.birthYear = "Select your birth year.";
      }
      if (!modelForm.bio) {
        errors.bio = "Short bio is required.";
      }
      if (!modelForm.tags) {
        errors.tags = "Add at least one tag.";
      }
      if (!ageGateConfirmed) {
        errors.ageGate = "Confirm you are 18+ to continue.";
      }
      if (!modelForm.disclaimerAccepted) {
        errors.disclaimer = "You must accept the agreement.";
      }
      if (Object.keys(errors).length > 0) {
        setModelErrors(errors);
        if (!ageGateConfirmed) {
          openAgeGate("model");
        }
        setModelStatus("Please fix the highlighted fields.");
        return;
      }
      const ageCheck = isAdult(modelForm.birthYear, modelForm.birthMonth);
      if (!ageCheck.ok) {
        setModelErrors({ birthYear: ageCheck.message });
        setModelStatus(ageCheck.message);
        return;
      }
      setModelErrors({});
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
    if (!modelLocationValue) {
      setModelStatus("Location is required to submit verification.");
      return;
    }
    if (!modelForm.disclaimerAccepted) {
      setModelStatus("You must accept the agreement to submit verification.");
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
          location: modelLocationValue,
          birth_month: modelForm.birthMonth,
          birth_year: modelForm.birthYear,
          bio: modelForm.bio,
          tags: modelForm.tags,
          availability: modelForm.availability,
          video_path: uploadPayload.path,
          disclaimer_accepted: modelForm.disclaimerAccepted,
          disclaimer_version: DISCLAIMER_VERSION,
        }),
      });
      if (!res.ok) {
        let detail = `Submission failed (HTTP ${res.status}).`;
        try {
          const payload = await res.json();
          if (payload?.detail) {
            detail = `${detail} ${payload.detail}`;
          } else if (payload?.error === "missing_location") {
            detail = "Add your location to continue.";
          } else if (payload?.error === "disclaimer_required") {
            detail = "You must accept the agreement to continue.";
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
          publish_at: contentForm.publishAt || undefined,
          expires_at: contentForm.expiresAt || undefined,
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
      publishAt: "",
      expiresAt: "",
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
          <div className="brand brand-logo-only">
            <span className="logo-mark">
              <img loading="lazy" decoding="async" src="/brand/logo.png" alt="Velvet Rooms logo" />
            </span>
            <span className="logo-text">Velvet Rooms</span>
          </div>
          <div className="spinner" />
          <p className="helper">Loading your dashboard…</p>
        </div>
      </main>
    );
  }

  const showOnboarding = !role && !roleLocked && !onboardingComplete;

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo-mark small">
            <img loading="lazy" decoding="async" src="/brand/logo.png" alt="Velvet Rooms logo" />
          </span>
          <span className="logo-text">Velvet Rooms</span>
        </div>
        {!roleLocked && !showOnboarding && (
          <div className="top-actions">
            <button className={`ghost ${role === "client" ? "active" : ""}`} onClick={() => handleRole("client")}>
              Client
            </button>
            <button className={`ghost ${role === "model" ? "active" : ""}`} onClick={() => handleRole("model")}>
              Model
            </button>
            {!role && onboardingComplete && (
              <button
                className="ghost"
                onClick={() => {
                  setOnboardingComplete(false);
                  setOnboardingStep(0);
                }}
              >
                Resume onboarding
              </button>
            )}
          </div>
        )}
        {roleLocked && lockedRole && (
          <div className="top-actions">
            <span className="pill">Account: {lockedRole === "model" ? "Model" : "Client"}</span>
          </div>
        )}
        {(role || roleLocked) && !showOnboarding && (
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

      {showOnboarding && (
        <section className="onboarding">
          <div className="onboarding-card">
            <div className="onboarding-copy">
              <p className="eyebrow">{onboardingCurrent.eyebrow}</p>
              <h1>{onboardingCurrent.title}</h1>
              <p className="lead">{onboardingCurrent.body}</p>
              <div className="onboarding-meta">
                <div className="stepper">
                  {onboardingSlides.map((_, index) => (
                    <span
                      key={`onboarding-step-${index}`}
                      className={onboardingStep >= index ? "step active" : "step"}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
                <span className="onboarding-count">
                  Step {onboardingStep + 1} of {onboardingTotal} · {onboardingProgress}%
                </span>
              </div>
              <div className="onboarding-points">
                {onboardingCurrent.points.map((point) => (
                  <div className="status" key={point}>
                    <span className="dot" />
                    {point}
                  </div>
                ))}
              </div>
            </div>
            <div className={`onboarding-visual ${onboardingCurrent.visual}`}>
              <div className="onboarding-image">
                <img loading="lazy" decoding="async" src={onboardingCurrent.image} alt={onboardingCurrent.title} />
                <div className="onboarding-cta">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={retreatOnboarding}
                    disabled={onboardingStep === 0}
                  >
                    Back
                  </button>
                  <button type="button" className="cta primary" onClick={advanceOnboarding}>
                    {onboardingCurrent.cta}
                  </button>
                </div>
              </div>
              <div className="onboarding-thumbs">
                {onboardingSlides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    className={`onboarding-thumb ${index === onboardingStep ? "active" : ""}`}
                    style={{ backgroundImage: `url(${slide.image})` }}
                    onClick={() => setOnboardingStep(index)}
                    aria-label={`Go to ${slide.title}`}
                  />
                ))}
              </div>
              <div className="onboarding-glow" />
            </div>
          </div>
        </section>
      )}

      {!role && !roleLocked && !showOnboarding && (
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Private Creator Marketplace</p>
          <h1>Premium content. Private sessions. Escrow‑protected.</h1>
          <p className="lead">
            Velvet Rooms is a verified, members‑only platform for premium content and live sessions.
            Content and session payments are held in escrow, every creator is approved, every action logged.
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

      {!role && !roleLocked && !showOnboarding && (
      <section className="role-grid">
        <article className={`role-card ${role === "client" ? "selected" : ""}`}>
          <h3>Client Flow</h3>
          <ol>
            <li>Register → pay access fee</li>
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
            {!clientAccessPaid && (
              <div className="step-header">
                <div>
                  <p className="eyebrow">
                    Step {clientStep} of 3 · {Math.round((clientStep / 3) * 100)}%
                  </p>
                  <strong>
                    {clientStep === 1
                      ? "Profile details"
                      : clientStep === 2
                      ? "Access fee"
                      : "Gallery"}
                  </strong>
                </div>
                <div className="stepper">
                  <span className={clientStep >= 1 ? "step active" : "step"}>1</span>
                  <span className={clientStep >= 2 ? "step active" : "step"}>2</span>
                  <span className={clientStep >= 3 ? "step active" : "step"}>3</span>
                </div>
              </div>
            )}
            {profile?.user && (
              <div className="flow-card">
                <h3>Welcome, {clientDisplayName}</h3>
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
            {profile?.user && (
              <div className="flow-card profile-summary">
                <div className="summary-head">
                  <span className="avatar">
                    {avatarUrl ? (
                      <img loading="lazy" decoding="async" src={avatarUrl} alt="Profile" />
                    ) : (
                      <span>{(clientDisplayName || "C")[0]}</span>
                    )}
                  </span>
                  <div>
                    <strong>{clientDisplayName}</strong>
                    <p className="muted">
                      {clientAccessPaid ? "Gallery unlocked" : "Access pending"}
                    </p>
                  </div>
                  <span className={`pill ${clientAccessPaid ? "success" : "warning"}`}>
                    {clientAccessPaid ? "Active" : "Pending"}
                  </span>
                </div>
                <div className="summary-grid">
                  <div>
                    <span className="eyebrow">Wallet</span>
                    <strong>
                      ₦{Number(profile?.user?.wallet_balance || 0).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="eyebrow">Location</span>
                    <strong>{profile?.client?.location || "Not set"}</strong>
                  </div>
                </div>
                {clientAccessPaid && (
                  <div className="summary-actions">
                    <button
                      type="button"
                      className="cta ghost"
                      onClick={() => setClientTab("profile")}
                    >
                      Edit profile
                    </button>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() => setClientTab("gallery")}
                    >
                      Browse gallery
                    </button>
                  </div>
                )}
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
                        onChange={(event) => updateClientField("displayName", event.target.value)}
                        placeholder="VelvetClient"
                      />
                      {clientErrors.displayName && (
                        <p className="field-error">{clientErrors.displayName}</p>
                      )}
                    </label>
                    <label className="field">
                      Email
                      <input
                        type="email"
                        value={clientForm.email}
                        onChange={(event) => updateClientField("email", event.target.value)}
                        placeholder="you@email.com"
                      />
                      <p className="field-hint">Why we ask: receipts and account recovery.</p>
                      {clientErrors.email && (
                        <p className="field-error">{clientErrors.email}</p>
                      )}
                    </label>
                    {renderLocationFields({
                      countryIso: clientCountryIso,
                      regionName: clientRegionName,
                      regionData: clientRegionData,
                      onCountryChange: (value) => {
                        setClientCountryIso(value);
                        setClientLocationDirty(true);
                        setClientErrors((prev) => ({ ...prev, country: "", region: "" }));
                      },
                      onRegionChange: (value) => {
                        setClientRegionName(value);
                        setClientLocationDirty(true);
                        setClientErrors((prev) => ({ ...prev, region: "" }));
                      },
                      idPrefix: "client-onboarding",
                    })}
                    <p className="field-hint">
                      Why we ask: to localize discovery and enforce regional rules.
                    </p>
                    {clientErrors.country && (
                      <p className="field-error">{clientErrors.country}</p>
                    )}
                    {clientErrors.region && (
                      <p className="field-error">{clientErrors.region}</p>
                    )}
                    <div className="field-row">
                      <label className="field">
                        Birth month
                        <select
                          value={clientForm.birthMonth}
                          onChange={(event) =>
                            updateClientField("birthMonth", event.target.value)
                          }
                        >
                          {birthMonthOptions.map((option) => (
                            <option key={option.value || "month"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {clientErrors.birthMonth && (
                          <p className="field-error">{clientErrors.birthMonth}</p>
                        )}
                      </label>
                      <label className="field">
                        Birth year
                        <select
                          value={clientForm.birthYear}
                          onChange={(event) =>
                            updateClientField("birthYear", event.target.value)
                          }
                        >
                          {birthYearOptions.map((option) => (
                            <option key={option.value || "year"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {clientErrors.birthYear && (
                          <p className="field-error">{clientErrors.birthYear}</p>
                        )}
                      </label>
                    </div>
                    <p className="field-hint">
                      Why we ask: to verify you are 18+. This stays private.
                    </p>
                    {clientErrors.ageGate && (
                      <p className="field-error">{clientErrors.ageGate}</p>
                    )}
                    <div className="notice-card agreement-box">
                      <h4>Compliance & Data Use Agreement</h4>
                      <p className="helper">
                        By continuing, you confirm you are 18+ and will not use Velvet Rooms for
                        illegal activity, exploitation, trafficking, or non-consensual content.
                      </p>
                      <p className="helper">
                        We use account, profile, verification media, payment, and usage data to
                        operate the platform, prevent abuse, resolve disputes, and comply with law.
                        We only share data with required service providers (payments and storage) or
                        when legally required.
                      </p>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={clientForm.disclaimerAccepted}
                          onChange={(event) =>
                            updateClientField("disclaimerAccepted", event.target.checked)
                          }
                        />
                        <span>
                          I agree to the Compliance & Data Use Agreement (v{DISCLAIMER_VERSION}).
                        </span>
                      </label>
                      {clientErrors.disclaimer && (
                        <p className="field-error">{clientErrors.disclaimer}</p>
                      )}
                    </div>
                    {!roleLocked && (
                      <button type="button" className="cta ghost" onClick={goToRolePicker}>
                        Back
                      </button>
                    )}
                  </div>
                )}
                {clientStep === 2 && (
                  <div className="flow-card">
                    <h3>Access Fee</h3>
                    <p>
                        Pay once to unlock verified creator content. Admin approval unlocks access.
                    </p>
                    <div className="price-tag">
                      ₦5,000 <span>Admin approval</span>
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
                <div className="dash-actions tabs primary-nav">
                  <button
                    type="button"
                    className={`cta ${clientTab === "gallery" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("gallery")}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    className={`cta ${clientTab === "sessions" && sessionListMode !== "chat" ? "primary" : "ghost"}`}
                    onClick={() => {
                      setClientTab("sessions");
                      setSessionListMode("all");
                    }}
                  >
                    Sessions
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
                    className={`cta ${clientTab === "wallet" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("wallet")}
                  >
                    Wallet
                  </button>
                  <label className="field tab-select nav-more">
                    More
                    <select
                      value={["purchases", "following"].includes(clientTab) ? clientTab : ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value) {
                          setClientTab(value);
                        }
                      }}
                    >
                      <option value="">More…</option>
                      <option value="purchases">Purchases</option>
                      <option value="following">Following</option>
                    </select>
                  </label>
                </div>
                <div className="sync-row" data-sync-tick={syncTicker}>
                  <SyncIndicator
                    lastSyncedAt={syncMarks[currentSyncScope]}
                    active={pageVisible}
                    label="Last synced"
                  />
                </div>

                {clientTab === "gallery" && (
                  <div className="flow-card">
                    <h3>Content Gallery</h3>
                    <p>Browse verified creators, buy content, or book a session.</p>
                    <div className="dash-actions">
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={refreshGalleryAccess}
                      >
                        Refresh gallery
                      </button>
                    </div>
                    <div className="gallery-filters">
                      <button
                        type="button"
                        className={`pill ${galleryFilter === "all" ? "active" : ""}`}
                        onClick={() => setGalleryFilter("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`pill ${galleryFilter === "liked" ? "active" : ""}`}
                        onClick={() => setGalleryFilter("liked")}
                      >
                        Liked
                      </button>
                      <button
                        type="button"
                        className={`pill ${galleryFilter === "saved" ? "active" : ""}`}
                        onClick={() => setGalleryFilter("saved")}
                      >
                        Saved
                      </button>
                    </div>
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
                    {galleryLoading && (
                      <div className="gallery-grid">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div key={`gallery-skeleton-${index}`} className="gallery-card skeleton">
                            <div className="gallery-media skeleton-block" />
                            <div className="gallery-body">
                              <div className="skeleton-line wide" />
                              <div className="skeleton-line" />
                              <div className="skeleton-line short" />
                              <div className="skeleton-row">
                                <div className="skeleton-pill" />
                                <div className="skeleton-pill" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                    {!galleryStatus && !galleryLoading && visibleGalleryItems.length === 0 && (
                      <p className="helper">
                        {galleryItems.length === 0
                          ? "No approved teasers yet."
                          : "No items match this filter yet."}
                      </p>
                    )}
                    {!galleryStatus && !galleryLoading && visibleGalleryItems.length > 0 && (
                      <>
                        <div className="gallery-grid" id="client-gallery">
                          {visibleGalleryItems.map((item) => (
                            <div
                              key={`gallery-${item.id}`}
                              id={`gallery-card-${item.id}`}
                              className="gallery-card"
                            >
                              <div className="gallery-media">
                                {item.preview_thumb_url || item.preview_url ? (
                                  item.content_type === "video" ? (
                                    <video
                                      src={item.preview_thumb_url || item.preview_url}
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={item.preview_thumb_url || item.preview_url}
                                      alt={item.title || "Teaser"}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  )
                                ) : (
                                  <div className="media-fallback">Tap to view</div>
                                )}
                                <div className="gallery-overlay">
                                  <span className="pill ghost">
                                    {item.content_type === "video" ? "Video" : "Image"}
                                  </span>
                                  {item.price ? (
                                    <span className="pill warning">Unlock ₦{item.price}</span>
                                  ) : (
                                    <span className="pill success">Free</span>
                                  )}
                                </div>
                              </div>
                              <div className="gallery-body">
                                <div className="gallery-headline">
                                  <div>
                                    <h4>{item.title}</h4>
                                    <p>{item.description || "Exclusive teaser content."}</p>
                                  </div>
                                  <div className="badge-row">
                                    {item.verification_status === "approved" && (
                                      <span className="pill success">Verified</span>
                                    )}
                                    {item.is_spotlight && (
                                      <span className="pill featured">Featured</span>
                                    )}
                                    {item.is_new_from_followed && (
                                      <span className="pill">New</span>
                                    )}
                                    {!item.price && <span className="pill">Teaser</span>}
                                  </div>
                                </div>
                                <div className="gallery-meta">
                                  <span className="gallery-user">
                                    <span className="avatar tiny">
                                      {item.avatar_url ? (
                                        <img loading="lazy" decoding="async" src={item.avatar_url} alt="Creator" />
                                      ) : (
                                        <span>
                                          {(item.display_name || item.public_id || "M")[0]}
                                        </span>
                                      )}
                                    </span>
                                    {item.display_name || item.public_id}
                                  </span>
                                  <span>{item.content_type}</span>
                                </div>
                                <div className="gallery-stats">
                                  <span className="pill ghost">
                                    {Number(item.views_count || 0)} views
                                  </span>
                                  <button
                                    type="button"
                                    className={`pill ghost like-pill ${
                                      item.has_liked ? "active" : ""
                                    }`}
                                    onClick={() => toggleLike(item.id)}
                                  >
                                    {item.has_liked ? "Liked" : "Like"} ·{" "}
                                    {Number(item.likes_count || 0)}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill ghost ${
                                      savedGallerySet.has(item.id) ? "active" : ""
                                    }`}
                                    onClick={() => toggleSaved(item.id)}
                                  >
                                    {savedGallerySet.has(item.id) ? "Saved" : "Save"}
                                  </button>
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
                                    className="cta primary alt"
                                    onClick={() => openBooking(item)}
                                  >
                                    Book session
                                  </button>
                                  <button
                                    type="button"
                                    className={`cta ghost ${
                                      item.is_following ? "active" : ""
                                    } ${followState[item.model_id]?.loading ? "loading" : ""}`}
                                    onClick={() => toggleFollow(item.model_id)}
                                    disabled={followState[item.model_id]?.loading}
                                  >
                                    {item.is_following ? "Following" : "Follow"}
                                  </button>
                                  <button
                                    type="button"
                                    className="cta ghost"
                                    onClick={() => openCreator(item)}
                                  >
                                    View profile
                                  </button>
                                  <button
                                    type="button"
                                    className="cta ghost"
                                    onClick={() =>
                                      openReportDialog(item.id, item.title || "content", "content")
                                    }
                                  >
                                    Report content
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
                                  ) : null}
                                </div>
                                {followState[item.model_id]?.error && (
                                  <p className="helper error">
                                    {followState[item.model_id]?.error}
                                  </p>
                                )}
                                {blockState[item.model_id]?.error && (
                                  <p className="helper error">
                                    {blockState[item.model_id]?.error}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {galleryHasMore && (
                          <div className="dash-actions">
                            <button
                              type="button"
                              className={`cta ghost ${galleryLoadingMore ? "loading" : ""}`}
                              onClick={loadMoreGallery}
                              disabled={galleryLoadingMore}
                            >
                              {galleryLoadingMore ? "Loading…" : "Load more"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {clientTab === "profile" && (
                  <div className="flow-card">
                    <h3>Your Profile</h3>
                    {profileSavedStatus && (
                      <p className="helper success">{profileSavedStatus}</p>
                    )}
                    <div className="profile-progress">
                      <div className="line">
                        <span>Profile completion</span>
                        <strong>{profileChecklist.percent}%</strong>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${profileChecklist.percent}%` }} />
                      </div>
                      {profileChecklist.missing.length > 0 ? (
                        <ul className="checklist">
                          {profileChecklist.missing.map((item) => (
                            <li key={`missing-${item}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="helper">Profile complete ✅</p>
                      )}
                    </div>
                    <div className="avatar-row">
                      <div className="avatar">
                        {avatarUrl ? (
                          <img loading="lazy" decoding="async" src={avatarUrl} alt="Profile" />
                        ) : (
                          <span>{(clientDisplayName || "C")[0]}</span>
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
                    {avatarPreviewUrl && (
                      <div className="avatar-cropper">
                        <div
                          className="avatar-crop-frame"
                          onPointerDown={handleAvatarDragStart}
                          onPointerMove={handleAvatarDragMove}
                          onPointerUp={handleAvatarDragEnd}
                          onPointerLeave={handleAvatarDragEnd}
                          onPointerCancel={handleAvatarDragEnd}
                        >
                          <img loading="lazy" decoding="async" src={avatarPreviewUrl}
                            alt="Crop preview"
                            style={{
                              transform: `translate(${avatarCrop.x}px, ${avatarCrop.y}px) scale(${avatarCrop.scale})`,
                            }}
                          />
                        </div>
                        <label className="field">
                          Zoom
                          <input
                            type="range"
                            min={avatarMinScale}
                            max={avatarMinScale * 3}
                            step="0.01"
                            value={avatarCrop.scale}
                            onChange={(event) => handleAvatarZoomChange(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() =>
                            setAvatarCrop({
                              scale: avatarMinScale,
                              x: (AVATAR_CROP_SIZE - avatarImageMeta.width * avatarMinScale) / 2,
                              y: (AVATAR_CROP_SIZE - avatarImageMeta.height * avatarMinScale) / 2,
                            })
                          }
                          disabled={!avatarImageMeta.width}
                        >
                          Reset crop
                        </button>
                      </div>
                    )}
                    <div className="line">
                      <span>Display name</span>
                      <strong>
                        {clientDisplayName || profile?.user?.first_name || "-"}
                      </strong>
                    </div>
                    <div className="line">
                      <span>Email</span>
                      <strong>{profile?.user?.email || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Location</span>
                      <strong>{profile?.client?.location || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Birth month/year</span>
                      <strong>
                        {profile?.client?.birth_month && profile?.client?.birth_year
                          ? `${profile.client.birth_month}/${profile.client.birth_year}`
                          : "-"}
                      </strong>
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
                    <div className="line">
                      <span>Session streak</span>
                      <strong>{sessionStreak} day{sessionStreak === 1 ? "" : "s"}</strong>
                    </div>
                    <div className="field-row">
                      <label className="pill">
                        <input
                          type="checkbox"
                          checked={profile?.user?.privacy_hide_email ?? true}
                          onChange={(event) =>
                            updatePrivacy({
                              hideEmail: event.target.checked,
                              hideLocation: profile?.user?.privacy_hide_location ?? true,
                            })
                          }
                        />
                        Hide email
                      </label>
                      <label className="pill">
                        <input
                          type="checkbox"
                          checked={profile?.user?.privacy_hide_location ?? true}
                          onChange={(event) =>
                            updatePrivacy({
                              hideEmail: profile?.user?.privacy_hide_email ?? true,
                              hideLocation: event.target.checked,
                            })
                          }
                        />
                        Hide location
                      </label>
                    </div>
                    <div className="dash-actions">
                      <button type="button" className="cta primary alt" onClick={openProfileEdit}>
                        Edit profile
                      </button>
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={fetchBlockedList}
                        disabled={blockedListLoading}
                      >
                        {blockedListLoading ? "Loading…" : "Refresh blocklist"}
                      </button>
                    </div>
                    {blockedListStatus && <p className="helper error">{blockedListStatus}</p>}
                    {!blockedListLoading && blockedList.length > 0 && (
                      <div className="flow-card nested">
                        <h4>Blocked users</h4>
                        <p className="helper">
                          Blocked users can’t see your content, and you won’t see theirs.
                        </p>
                        {blockedList.map((item) => (
                          <div key={`blocked-${item.id}`} className="list-row">
                            <div className="gallery-user">
                                  <span className="avatar tiny">
                                    {item.avatar_url ? (
                                      <img loading="lazy" decoding="async" src={item.avatar_url} alt="User" />
                                    ) : (
                                      <span>{resolveDisplayName(item, "U")[0]}</span>
                                    )}
                                  </span>
                                  <div>
                                    <strong>{resolveDisplayName(item)}</strong>
                                    {item.verification_status === "approved" && (
                                      <span className="pill success">Verified</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="cta ghost"
                                  onClick={() =>
                                    requestBlockToggle(
                                      item.id,
                                      resolveDisplayName(item, "")
                                    )
                                  }
                                >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="cta primary alt" onClick={deleteClientAccount}>
                      Delete account
                    </button>
                    {clientDeleteStatus && <p className="helper error">{clientDeleteStatus}</p>}
                  </div>
                )}

                {clientTab === "following" && (
                  <div className="flow-card">
                    <h3>Following</h3>
                    {followingStatus && <ErrorState message={followingStatus} />}
                    {followingLoading && <p className="helper">Loading creators…</p>}
                    {!followingLoading && !followingStatus && following.length === 0 && (
                      <EmptyState
                        title="No followed creators yet."
                        body="Follow a creator to see updates and faster booking access."
                      />
                    )}
                    {!followingLoading &&
                      following.map((creator) => (
                        <div key={`follow-${creator.id}`} className="list-row">
                          <div className="gallery-user">
                            <span className="avatar tiny">
                              {creator.avatar_url ? (
                                <img loading="lazy" decoding="async" src={creator.avatar_url} alt="Creator" />
                              ) : (
                                <span>{(creator.display_name || creator.public_id || "M")[0]}</span>
                              )}
                            </span>
                            <div>
                              <strong>{creator.display_name || creator.public_id}</strong>
                              {creator.verified && <span className="pill success">Verified</span>}
                            </div>
                          </div>
                        <div className="session-actions">
                            <StatusPill tone={creator.is_online ? "success" : "neutral"}>
                              {formatPresence(creator.is_online, creator.last_seen_at)}
                            </StatusPill>
                            <button
                              type="button"
                              className="cta ghost"
                              onClick={() => openCreator(creator)}
                            >
                              View profile
                            </button>
                            <button
                              type="button"
                              className={`cta ghost ${
                                followState[creator.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() => toggleFollow(creator.id)}
                              disabled={followState[creator.id]?.loading}
                            >
                              Unfollow
                            </button>
                          </div>
                        </div>
                      ))}
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
                    <div className="dash-actions">
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "all" ? "active" : ""}`}
                        onClick={() => setSessionListMode("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "calls" ? "active" : ""}`}
                        onClick={() => setSessionListMode("calls")}
                      >
                        Calls
                      </button>
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "chat" ? "active" : ""}`}
                        onClick={() => setSessionListMode("chat")}
                      >
                        Chat sessions
                      </button>
                    </div>
                    {clientSessionsStatus && (
                      <p className="helper error">{clientSessionsStatus}</p>
                    )}
                    {clientSessionsLoading && (
                      <div className="list-skeleton">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={`session-skel-${index}`} className="list-row skeleton">
                            <div className="skeleton-line wide" />
                            <div className="skeleton-line short" />
                          </div>
                        ))}
                      </div>
                    )}
                    {!clientSessionsStatus && !clientSessionsLoading && visibleClientSessions.length === 0 && (
                      <p className="helper">
                        {sessionListMode === "chat"
                          ? "No chat sessions yet."
                          : sessionListMode === "calls"
                          ? "No voice/video sessions yet."
                          : "No sessions yet."}
                      </p>
                    )}
                    {!clientSessionsLoading && visibleClientSessions.map((item) => (
                          <div
                            key={`session-${item.id}`}
                            id={`client-session-${item.id}`}
                            className="list-row"
                          >
                        <div>
                          <strong>{item.model_label || "Model"}</strong>
                          <p className="muted">
                            {item.session_type} · {item.duration_minutes} min
                          </p>
                          <div className="session-timeline">
                            <span className="timeline-dot" />
                            <span>{formatSessionTime(item)}</span>
                          </div>
                        </div>
                        <div className="session-actions">
                          <span className={`pill ${getStatusTone(item.status)}`}>
                            {formatSessionStatus(item.status)}
                          </span>
                          {["accepted", "active"].includes(item.status) && (
                            <button
                              type="button"
                              className={`cta primary start ${
                                sessionActionStatus[item.id]?.loading ? "loading" : ""
                              }`}
                              onClick={() => handleSessionJoin(item)}
                              disabled={sessionActionStatus[item.id]?.loading}
                            >
                              {item.session_type === "chat" ? "Open chat" : "Start session"}
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
                              onClick={() => requestSessionCancel(item.id)}
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
                          {["completed", "disputed", "cancelled_by_client", "cancelled_by_model", "rejected"].includes(
                            item.status
                          ) && (
                            <button
                              type="button"
                              className="cta ghost"
                              onClick={() =>
                                openBooking({
                                  model_id: item.model_id,
                                  model_label: item.model_label,
                                  model_public_id: item.model_public_id,
                                })
                              }
                              disabled={!item.model_id}
                            >
                              Book again
                            </button>
                          )}
                        </div>
                        {sessionActionStatus[item.id]?.error && (
                          <>
                            <p className="helper error">
                              {sessionActionStatus[item.id]?.error}
                            </p>
                            <div className="session-actions retry-row">
                              <button
                                type="button"
                                className="cta ghost"
                                onClick={() => handleSessionJoin(item)}
                              >
                                Retry
                              </button>
                              {item.session_type !== "chat" && (
                                <button
                                  type="button"
                                  className="cta ghost"
                                  onClick={() => openPermissionCheck(item.session_type)}
                                >
                                  Check permissions
                                </button>
                              )}
                            </div>
                          </>
                        )}
                        {sessionActionStatus[item.id]?.info && (
                          <p className="helper">
                            {sessionActionStatus[item.id]?.info}
                          </p>
                        )}
                        {item.status === "disputed" && (
                          <div className="dispute-timeline">
                            <strong>Dispute timeline</strong>
                            <span>1. Session cancelled or ended early.</span>
                            <span>2. Escrow automatically moved to dispute review.</span>
                            <span>3. Admin will decide release or refund.</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {clientSessionsHasMore && !clientSessionsLoading && (
                      <div className="dash-actions">
                        <button
                          type="button"
                          className={`cta ghost ${clientSessionsLoadingMore ? "loading" : ""}`}
                          onClick={loadMoreClientSessions}
                          disabled={clientSessionsLoadingMore}
                        >
                          {clientSessionsLoadingMore ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    )}
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

      {callEndDialog.open && (
        <section className="modal-backdrop" onClick={() => setCallEndDialog((prev) => ({ ...prev, open: false }))}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>End session early?</h3>
            </header>
            <p className="helper">
              Choose a reason so we can handle the held funds correctly.
            </p>
            <label className="field">
              Reason
              <select
                value={callEndDialog.reason}
                onChange={(event) =>
                  setCallEndDialog((prev) => ({ ...prev, reason: event.target.value }))
                }
              >
                <option value="">Select a reason</option>
                {endReasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Notes (optional)
              <textarea
                rows={3}
                value={callEndDialog.note}
                onChange={(event) =>
                  setCallEndDialog((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder="Add details for the admin if needed."
              />
            </label>
            {callEndDialog.status && <p className="helper error">{callEndDialog.status}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="cta ghost"
                onClick={() =>
                  setCallEndDialog({ open: false, reason: "", note: "", status: "", sending: false })
                }
                disabled={callEndDialog.sending}
              >
                Keep call
              </button>
              <button
                type="button"
                className={`cta danger ${callEndDialog.sending ? "loading" : ""}`}
                onClick={() => {
                  if (!callEndDialog.reason) {
                    setCallEndDialog((prev) => ({
                      ...prev,
                      status: "Select a reason to continue.",
                    }));
                    return;
                  }
                  submitCallEnd({
                    reason: callEndDialog.reason,
                    note: callEndDialog.note,
                    auto: false,
                  });
                }}
                disabled={callEndDialog.sending}
              >
                End session
              </button>
            </div>
          </div>
        </section>
      )}

      {callState.open && (
        <section className="call-overlay">
          <div
            className={`call-card ${callChatOpen ? "chat-open" : ""} ${
              callChatOpen && callState.sessionType !== "chat" ? "chat-overlay" : ""
            } ${callState.sessionType === "chat" ? "chat-only" : ""} ${
              callConclusion.open ? "concluded" : ""
            }`}
          >
            <header className="call-top">
              <div className="call-title">
                <p className="eyebrow">
                  {callState.sessionType === "chat"
                    ? "Private chat"
                    : `${callState.sessionType || "session"} call`}
                </p>
                <h3>{callState.peerLabel || "Session"}</h3>
                <div className="call-timer">
                  {callProgress != null && (
                    <div className="call-progress">
                      <svg viewBox="0 0 36 36" aria-hidden="true">
                        <path
                          className="progress-track"
                          d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"
                        />
                        <path
                          className="progress-ring"
                          d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"
                          style={{
                            strokeDasharray: `${Math.round(callProgress * 100)} 100`,
                          }}
                        />
                      </svg>
                    </div>
                  )}
                  <span className="timer-elapsed">{callElapsedLabel}</span>
                  <span className="timer-remaining">{callRemainingLabel}</span>
                </div>
                {callState.sessionType === "video" && callState.audioOnly && (
                  <span className="pill ghost">Audio-only</span>
                )}
                {callState.status && <p className="helper">{callState.status}</p>}
              </div>
              <div className="call-head-actions">
                {callState.sessionType !== "chat" && (
                  <span className={`status-chip ${callQuality.tone}`}>
                    Quality: {callQuality.label}
                  </span>
                )}
                {callState.sessionType !== "chat" && (
                  <span className="status-chip neutral">Privacy protected</span>
                )}
                <span className={`status-chip ${callStatusChip.tone}`}>
                  {callStatusChip.label}
                </span>
                <button
                  type="button"
                  className="icon-btn call-mini-menu"
                  onClick={() => setCallMenuOpen((prev) => !prev)}
                  aria-label="Open call menu"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M5 12h14M5 17h14" />
                  </svg>
                </button>
                {callState.sessionType !== "chat" && (
                  <button
                    type="button"
                    className={`icon-btn ${callChatOpen ? "active" : ""} ${
                      callUnreadCount > 0 ? "badged" : ""
                    }`}
                    onClick={toggleCallChat}
                    aria-label="Toggle chat"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 4h16v10H7l-3 3V4z" />
                    </svg>
                    {callUnreadCount > 0 && <span className="mini-badge">{callUnreadCount}</span>}
                  </button>
                )}
              </div>
            </header>
            {callToast.open && (
              <div className={`call-toast ${callToast.tone}`}>{callToast.message}</div>
            )}
            {callConclusion.open && (
              <div className="call-conclusion">
                <h3>{callConclusion.title}</h3>
                <p>{callConclusion.body}</p>
                <div className="rating-row">
                  <span>Rate this session</span>
                  <div className="rating-actions">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={`rating-${value}`}
                        type="button"
                        className={`pill ghost ${callRating.value === value ? "active" : ""}`}
                        onClick={() => submitCallRating(value)}
                        disabled={callRating.submitted}
                      >
                        {value}★
                      </button>
                    ))}
                  </div>
                  {callRating.status && <p className="helper">{callRating.status}</p>}
                </div>
                <div className="dash-actions">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => {
                      setClientTab("sessions");
                      closeCallConclusion();
                    }}
                  >
                    Rebook
                  </button>
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => {
                      setClientTab("gallery");
                      closeCallConclusion();
                    }}
                  >
                    Similar models
                  </button>
                </div>
                <button type="button" className="cta primary" onClick={closeCallConclusion}>
                  Back to dashboard
                </button>
              </div>
            )}
            {callMenuOpen && (
              <div className="call-menu-panel">
                <button
                  type="button"
                  className={`menu-item ${callState.micMuted ? "active" : ""}`}
                  onClick={() => {
                    toggleMute();
                    setCallMenuOpen(false);
                  }}
                >
                  {callState.micMuted ? "Unmute" : "Mute"}
                </button>
                {callState.sessionType === "video" && !callState.audioOnly && (
                  <button
                    type="button"
                    className={`menu-item ${callState.cameraOff ? "active" : ""}`}
                    onClick={() => {
                      toggleCamera();
                      setCallMenuOpen(false);
                    }}
                  >
                    {callState.cameraOff ? "Camera on" : "Camera off"}
                  </button>
                )}
                {callState.sessionType !== "chat" && (
                  <button
                    type="button"
                    className={`menu-item ${callChatOpen ? "active" : ""}`}
                    onClick={() => {
                      toggleCallChat();
                      setCallMenuOpen(false);
                    }}
                  >
                    {callChatOpen
                      ? "Hide chat"
                      : callUnreadCount > 0
                      ? `Show chat (${callUnreadCount})`
                      : "Show chat"}
                  </button>
                )}
                {callState.sessionType === "video" && (
                  <button
                    type="button"
                    className={`menu-item ${callReactionTrayOpen ? "active" : ""}`}
                    onClick={() => {
                      setCallReactionTrayOpen((prev) => !prev);
                      setCallMenuOpen(false);
                    }}
                  >
                    {callReactionTrayOpen ? "Hide reactions" : "Send reaction"}
                  </button>
                )}
                <button
                  type="button"
                  className="menu-item danger"
                  onClick={() => {
                    setCallMenuOpen(false);
                    requestEndCall();
                  }}
                >
                  End session
                </button>
              </div>
            )}
            {callConnectionStatus === "reconnecting" && callState.sessionType !== "chat" && (
              <div className="call-banner warn">
                Reconnecting… We’ll restore the call once the network stabilizes.
              </div>
            )}
            {callState.sessionType === "video" &&
              callConnectionStatus === "connected" &&
              !callPreflight.open && (
                <div className="call-banner">
                  Privacy mode is active. Leaving the app or capture attempts end the session.
                </div>
              )}
            {callPreflight.open && callState.sessionType !== "chat" ? (
              <div className="call-preflight">
                <h4>Before you start</h4>
                <p className="helper">Check your microphone and camera permissions.</p>
                <div className="preflight-list">
                  <div className={`preflight-item ${callPreflight.mic}`}>
                    <span>Microphone</span>
                    <strong>
                      {callPreflight.mic === "ok"
                        ? "Allowed"
                        : callPreflight.mic === "blocked"
                        ? "Blocked"
                        : "Not checked"}
                    </strong>
                  </div>
                  {callState.sessionType === "video" && (
                    <div className={`preflight-item ${callPreflight.cam}`}>
                      <span>Camera</span>
                      <strong>
                        {callPreflight.audioOnly
                          ? "Audio-only"
                          : callPreflight.cam === "ok"
                          ? "Allowed"
                          : callPreflight.cam === "blocked"
                          ? "Blocked"
                          : "Not checked"}
                      </strong>
                    </div>
                  )}
                  <div className={`preflight-item ${callNetworkStatus}`}>
                    <span>Network</span>
                    <strong>{callNetworkStatus === "offline" ? "Offline" : "Online"}</strong>
                  </div>
                </div>
                {callState.sessionType === "video" && (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={callPreflight.audioOnly}
                      onChange={(event) =>
                        setCallPreflight((prev) => ({
                          ...prev,
                          audioOnly: event.target.checked,
                          cam: event.target.checked ? "na" : "unknown",
                        }))
                      }
                    />
                    <span>Join audio-only</span>
                  </label>
                )}
                <div className="dash-actions preflight-actions">
                  <button
                    type="button"
                    className="cta ghost"
                    onClick={() => {
                      if (!callState.sessionId) {
                        cleanupCall(false);
                        return;
                      }
                      setCallPreflight((prev) => ({ ...prev, open: false }));
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={`cta ghost ${callPreflight.checking ? "loading" : ""}`}
                    onClick={() => checkCallDevices(callState.sessionType, callPreflight.audioOnly)}
                    disabled={callPreflight.checking}
                  >
                    Enable microphone
                  </button>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={beginCallFromPreflight}
                      disabled={
                        !callState.sessionId ||
                        callPreflight.mic !== "ok" ||
                        (callState.sessionType === "video" &&
                          !callPreflight.audioOnly &&
                          callPreflight.cam !== "ok") ||
                        callNetworkStatus === "offline"
                      }
                    >
                      Start call
                    </button>
                </div>
              </div>
            ) : (
              <div
                className={`call-body ${
                  callState.sessionType === "chat" ? "chat-only" : ""
                }`}
              >
                {callState.sessionType !== "chat" && (
                  <div className="call-media">
                    {showVideoTiles && (
                      <div className="call-video-grid">
                        <div
                          className={`call-video remote ${
                            callConnectionStatus === "connected" ? "connected" : ""
                          } ${callRemoteVideoReady ? "ready" : ""}`}
                        >
                          <video ref={remoteVideoRef} autoPlay playsInline />
                          <div className="call-watermark">
                            <span>{`${selfDisplayName} · Session ${callState.sessionId || "--"} · ${new Date().toLocaleTimeString()}`}</span>
                          </div>
                          {!callRemoteVideoReady && (
                            <div className="video-placeholder">
                              <span>Waiting for partner video…</span>
                            </div>
                          )}
                          <span className="call-label">Partner</span>
                        </div>
                        <div className="call-video local">
                          <video ref={localVideoRef} autoPlay muted playsInline />
                          <span className="call-label">You</span>
                        </div>
                      </div>
                    )}
                    {showAudioTiles && (
                      <div className="call-audio-grid">
                        <div className="call-audio-tile">
                          <span className="eyebrow">Partner</span>
                          <p className="muted">
                            {callState.peerReady ? "Connected" : "Waiting"}
                          </p>
                        </div>
                        <div className="call-audio-tile">
                          <span className="eyebrow">You</span>
                          <p className="muted">{callState.micMuted ? "Muted" : "Mic on"}</p>
                        </div>
                      </div>
                    )}
                    {showAudioTiles && <audio ref={remoteAudioRef} autoPlay />}
                    {callState.sessionType === "video" && callReactions.length > 0 && (
                      <div className="call-reaction-stage" aria-live="polite">
                        {callReactions.map((reaction) => (
                          <div
                            key={reaction.id}
                            className={`call-reaction-float ${reaction.self ? "self" : "peer"}`}
                            style={{ left: `${reaction.lane}%` }}
                          >
                            <span>{reaction.emoji}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              <div
                className={`call-chat-panel ${
                  callState.sessionType === "chat" || callChatOpen ? "open" : ""
                }`}
              >
                <div className="chat-header">
                  <div>
                    <strong>{callState.peerLabel || "Chat partner"}</strong>
                    <span className="chat-status-line">
                      {callTyping
                        ? "Typing…"
                        : callConnectionStatus === "connected"
                        ? "Online"
                        : callConnectionStatus === "reconnecting"
                        ? "Reconnecting…"
                        : callConnectionStatus === "failed"
                        ? "Offline"
                        : "Connecting…"}
                    </span>
                  </div>
                  {callState.sessionType !== "chat" && (
                    <button
                      type="button"
                      className="cta ghost"
                      onClick={() => setCallChatOpen(false)}
                    >
                      Close
                    </button>
                  )}
                </div>
                <div className="chat-log" ref={chatLogRef}>
                    {callMessages.length === 0 && (
                      <p className="helper">Say hello. Messages are not saved.</p>
                    )}
                    {callMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-bubble ${message.self ? "self" : ""}`}
                      >
                        <span className="chat-name">
                          {message.self ? "You" : message.senderLabel || "Partner"}
                        </span>
                        <p>{message.text}</p>
                        {message.self && message.status && (
                          <span className="chat-status">
                            {message.status === "sending"
                              ? "Sending…"
                              : message.status === "sent"
                              ? "Sent"
                              : message.status === "delivered"
                              ? "Delivered"
                              : message.status === "failed"
                              ? "Failed"
                              : message.status}
                          </span>
                        )}
                        {message.self && message.status === "failed" && (
                          <div className="retry-row">
                            <button
                              type="button"
                              className="chat-retry"
                              onClick={() => resendFailedCallMessage(message.id)}
                            >
                              Retry send
                            </button>
                          </div>
                        )}
                        {message.sentAt && (
                          <span className="chat-time">
                            {new Date(message.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    ))}
                    {callTyping && (
                      <div className="chat-typing">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                        <span>Typing…</span>
                      </div>
                    )}
                  </div>
                  <div className="chat-input">
                    <input
                      type="text"
                      value={callInput}
                      onChange={(event) => {
                        setCallInput(event.target.value);
                        sendTypingSignal().catch(() => null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder="Type a message"
                    />
                    <button
                      type="button"
                      className="cta primary"
                      onClick={sendChatMessage}
                      disabled={!callInput.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
            {callState.sessionType === "video" &&
              !callPreflight.open &&
              !callConclusion.open &&
              callReactionTrayOpen && (
                <div className="call-reaction-tray">
                  {CALL_REACTION_OPTIONS.map((emoji) => (
                    <button
                      key={`reaction-${emoji}`}
                      type="button"
                      className="reaction-btn"
                      onClick={() => sendCallReaction(emoji)}
                      aria-label={`Send ${emoji} reaction`}
                    >
                      <span>{emoji}</span>
                    </button>
                  ))}
                </div>
              )}
            {callState.sessionType !== "chat" && !callPreflight.open && !callConclusion.open && (
              <div className="call-controls">
                <button
                  type="button"
                  className={`icon-btn ${callState.micMuted ? "active" : ""}`}
                  onClick={toggleMute}
                  aria-label={callState.micMuted ? "Unmute" : "Mute"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zm-5 8v-3h-2v3h2z" />
                  </svg>
                </button>
                {callState.sessionType === "video" && !callState.audioOnly && (
                  <button
                    type="button"
                    className={`icon-btn ${callState.cameraOff ? "active" : ""}`}
                    onClick={toggleCamera}
                    aria-label={callState.cameraOff ? "Camera on" : "Camera off"}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm14 2 4-2v12l-4-2V8z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className={`icon-btn ${callChatOpen ? "active" : ""} ${
                    callUnreadCount > 0 ? "badged" : ""
                  }`}
                  onClick={() => {
                    toggleCallChat();
                  }}
                  aria-label="Toggle chat"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 4h16v10H7l-3 3V4z" />
                  </svg>
                  {callUnreadCount > 0 && <span className="mini-badge">{callUnreadCount}</span>}
                </button>
                {callState.sessionType === "video" && (
                  <button
                    type="button"
                    className={`icon-btn ${callReactionTrayOpen ? "active" : ""}`}
                    onClick={() => setCallReactionTrayOpen((prev) => !prev)}
                    aria-label="Send live reaction"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s-6-4.35-9-8.5C.2 8.5 2.8 4 7 4c2.1 0 3.8 1.1 5 2.7C13.2 5.1 14.9 4 17 4c4.2 0 6.8 4.5 4 8.5C18 16.65 12 21 12 21z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn end"
                  onClick={requestEndCall}
                  aria-label="End call"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 15c2-3 5-4 9-4s7 1 9 4l-2 3c-2-2-4-3-7-3s-5 1-7 3l-2-3z" />
                  </svg>
                </button>
              </div>
            )}
            {callState.sessionType === "chat" && !callPreflight.open && !callConclusion.open && (
              <div className="call-controls chat-controls">
                <button
                  type="button"
                  className="icon-btn end"
                  onClick={requestEndCall}
                  aria-label="End chat"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 15c2-3 5-4 9-4s7 1 9 4l-2 3c-2-2-4-3-7-3s-5 1-7 3l-2-3z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

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
                <div key={`notif-group-${group.label}`} className="notification-group">
                  <p className="notification-group-label">{group.label}</p>
                  {group.items.map((item) => (
                    <div
                      key={`notif-${item.id}`}
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
            <div className="gallery-stats">
              <span className="pill ghost">
                {Number(previewOverlay.item.views_count || 0)} views
              </span>
              <button
                type="button"
                className={`pill ghost ${previewOverlay.item.has_liked ? "active" : ""}`}
                onClick={() => toggleLike(previewOverlay.item.id)}
              >
                {previewOverlay.item.has_liked ? "Liked" : "Like"} ·{" "}
                {Number(previewOverlay.item.likes_count || 0)}
              </button>
            </div>
            <div className="preview-media">
              {previewOverlay.item.content_type === "video" ? (
                <video
                  src={previewOverlay.item.preview_url}
                  autoPlay
                  playsInline
                  controls
                />
              ) : (
                <img loading="lazy" decoding="async" src={previewOverlay.item.preview_url} alt={previewOverlay.item.title} />
              )}
            </div>
          </div>
        </section>
      )}

      {creatorOverlay.open && creatorOverlay.creator && (
        <section className="preview-overlay" onClick={closeCreator}>
          <div className="preview-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div className="creator-header">
                <span className="avatar">
                  {creatorOverlay.creator.avatar_url ? (
                    <img loading="lazy" decoding="async" src={creatorOverlay.creator.avatar_url} alt="Creator" />
                  ) : (
                    <span>
                      {(creatorOverlay.creator.display_name ||
                        creatorOverlay.creator.public_id ||
                        "M")[0]}
                    </span>
                  )}
                </span>
                <div>
                  <p className="eyebrow">Creator profile</p>
                  <h3>{creatorOverlay.creator.display_name || creatorOverlay.creator.public_id}</h3>
                  {creatorOverlay.creator.verification_status === "approved" && (
                    <span className="pill success">Verified</span>
                  )}
                </div>
              </div>
              <button type="button" className="cta ghost" onClick={closeCreator}>
                Close
              </button>
            </header>
            <div className="creator-body">
              {creatorOverlay.creator.bio && (
                <p className="helper">{creatorOverlay.creator.bio}</p>
              )}
              <div className="tag-row">
                {(Array.isArray(creatorOverlay.creator.tags)
                  ? creatorOverlay.creator.tags
                  : (creatorOverlay.creator.tags || "")
                      .toString()
                      .split(",")
                      .map((tag) => tag.trim())
                )
                  .map((tag) => cleanTagLabel(tag))
                  .filter(Boolean)
                  .map((tag) => (
                    <span key={`tag-${tag}`} className="pill">
                      {tag}
                    </span>
                  ))}
              </div>
              {creatorOverlay.creator.availability && (
                <p className="helper">
                  Availability: {creatorOverlay.creator.availability}
                </p>
              )}
              <div className="gallery-actions">
                <button
                  type="button"
                  className="cta primary"
                  onClick={() => openBooking(creatorOverlay.creator)}
                >
                  Book session
                </button>
                <button
                  type="button"
                  className={`cta ghost ${
                    creatorOverlay.creator.is_following ? "active" : ""
                  } ${followState[creatorOverlay.creator.model_id]?.loading ? "loading" : ""}`}
                  onClick={() => toggleFollow(creatorOverlay.creator.model_id)}
                  disabled={followState[creatorOverlay.creator.model_id]?.loading}
                >
                  {creatorOverlay.creator.is_following ? "Following" : "Follow"}
                </button>
                <button
                  type="button"
                  className={`cta ghost ${
                    blockState[creatorOverlay.creator.model_id]?.loading ? "loading" : ""
                  }`}
                  onClick={() =>
                    requestBlockToggle(
                      creatorOverlay.creator.model_id,
                      creatorOverlay.creator.display_name ||
                        creatorOverlay.creator.public_id ||
                        ""
                    )
                  }
                  disabled={blockState[creatorOverlay.creator.model_id]?.loading}
                >
                  {isBlocked(creatorOverlay.creator.model_id) ? "Unblock" : "Block"}
                </button>
                <button
                  type="button"
                  className="cta ghost"
                  onClick={() =>
                    openReportDialog(
                      creatorOverlay.creator.model_id,
                      creatorOverlay.creator.display_name ||
                        creatorOverlay.creator.public_id ||
                        ""
                    )
                  }
                >
                  Report
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {ageGateOpen && (
        <section className="modal-backdrop" onClick={closeAgeGate}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>Age confirmation</h3>
              <button type="button" className="cta ghost" onClick={closeAgeGate}>
                Close
              </button>
            </header>
            <p className="helper">You must be 18+ to use Velvet Rooms. Are you 18 or older?</p>
            {ageGateStatus && <p className="helper error">{ageGateStatus}</p>}
            <div className="modal-actions">
              <button type="button" className="cta ghost" onClick={() => confirmAgeGate(false)}>
                No, I am under 18
              </button>
              <button type="button" className="cta primary" onClick={() => confirmAgeGate(true)}>
                Yes, I am 18+
              </button>
            </div>
          </div>
        </section>
      )}

      {confirmDialog.open && (
        <section className="modal-backdrop" onClick={closeConfirmDialog}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>{confirmDialog.title}</h3>
              <button type="button" className="cta ghost" onClick={closeConfirmDialog}>
                Close
              </button>
            </header>
            {confirmDialog.message && <p className="helper">{confirmDialog.message}</p>}
            {confirmDialog.status && <p className="helper error">{confirmDialog.status}</p>}
            <div className="modal-actions">
              <button type="button" className="cta ghost" onClick={closeConfirmDialog}>
                Cancel
              </button>
              <button
                type="button"
                className={`cta ${confirmDialog.danger ? "danger" : "primary"} ${
                  confirmDialog.busy ? "loading" : ""
                }`}
                onClick={runConfirmAction}
                disabled={confirmDialog.busy}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </section>
      )}

      {reportDialog.open && (
        <section className="modal-backdrop" onClick={closeReportDialog}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>
                Report{" "}
                {reportDialog.targetLabel ||
                  (reportDialog.targetType === "content" ? "content" : "user")}
              </h3>
              <button type="button" className="cta ghost" onClick={closeReportDialog}>
                Close
              </button>
            </header>
            <p className="helper">
              Reports go to the admin team for review. Choose a reason and add optional details.
            </p>
            <div className="accordion">
              {reportReasons.map((item) => (
                <div key={`reason-${item.key}`} className="accordion-item">
                  <button
                    type="button"
                    className={`accordion-head ${
                      reportDialog.selectedReason === item.key ? "active" : ""
                    }`}
                    onClick={() =>
                      setReportDialog((prev) => ({
                        ...prev,
                        selectedReason: item.key,
                        expanded: prev.expanded === item.key ? "" : item.key,
                        status: "",
                      }))
                    }
                  >
                    <span>{item.label}</span>
                    <span className="pill">
                      {reportDialog.expanded === item.key ? "Hide" : "Details"}
                    </span>
                  </button>
                  {reportDialog.expanded === item.key && (
                    <div className="accordion-body">
                      <p className="helper">{item.desc}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <label className="field">
              Extra details (optional)
              <textarea
                value={reportDialog.details}
                onChange={(event) =>
                  setReportDialog((prev) => ({ ...prev, details: event.target.value }))
                }
                placeholder="Anything the admin should know (max 500 chars)."
              />
            </label>
            {reportDialog.status && (
              <p className={`helper ${reportDialog.status.includes("✅") ? "" : "error"}`}>
                {reportDialog.status}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="cta ghost" onClick={closeReportDialog}>
                Cancel
              </button>
              <button
                type="button"
                className={`cta danger ${reportDialog.submitting ? "loading" : ""}`}
                onClick={submitReportDialog}
                disabled={reportDialog.submitting}
              >
                Submit report
              </button>
            </div>
          </div>
        </section>
      )}

      {profileEditOpen && (
        <section className="modal-backdrop drawer-backdrop" onClick={closeProfileEdit}>
          <div
            className="modal profile-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h3>Edit profile</h3>
              <button type="button" className="cta ghost" onClick={closeProfileEdit}>
                Close
              </button>
            </header>
            {role === "client" && (
              <>
                <label className="field">
                  Display name
                  <input
                    value={profileEditForm.username}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    placeholder="Choose a display name"
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    value={profileEditForm.email}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="you@email.com"
                  />
                </label>
                {renderLocationFields({
                  countryIso: profileCountryIso,
                  regionName: profileRegionName,
                  regionData: profileRegionData,
                  onCountryChange: (value) => {
                    setProfileCountryIso(value);
                    setProfileLocationDirty(true);
                  },
                  onRegionChange: (value) => {
                    setProfileRegionName(value);
                    setProfileLocationDirty(true);
                  },
                  idPrefix: "profile-client",
                })}
                <div className="field-row">
                  <label className="field">
                    Birth month
                    <select
                      value={profileEditForm.birthMonth}
                      onChange={(event) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          birthMonth: event.target.value,
                        }))
                      }
                    >
                      {birthMonthOptions.map((option) => (
                        <option key={option.value || "month"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Birth year
                    <select
                      value={profileEditForm.birthYear}
                      onChange={(event) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          birthYear: event.target.value,
                        }))
                      }
                    >
                      {birthYearOptions.map((option) => (
                        <option key={option.value || "year"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="helper">18+ only. Birth details stay private.</p>
              </>
            )}
            {role === "model" && (
              <>
                <label className="field">
                  Display name
                  <input
                    value={profileEditForm.stageName}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        stageName: event.target.value,
                      }))
                    }
                    placeholder="Your creator name"
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    value={profileEditForm.email}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="you@email.com"
                  />
                </label>
                {renderLocationFields({
                  countryIso: profileCountryIso,
                  regionName: profileRegionName,
                  regionData: profileRegionData,
                  onCountryChange: (value) => {
                    setProfileCountryIso(value);
                    setProfileLocationDirty(true);
                  },
                  onRegionChange: (value) => {
                    setProfileRegionName(value);
                    setProfileLocationDirty(true);
                  },
                  idPrefix: "profile-model",
                })}
                <label className="field">
                  Short bio
                  <textarea
                    value={profileEditForm.bio}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        bio: event.target.value,
                      }))
                    }
                    placeholder="Short bio"
                  />
                </label>
                <label className="field">
                  Tags (comma-separated)
                  <input
                    value={profileEditForm.tags}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        tags: event.target.value,
                      }))
                    }
                    placeholder="e.g. cosplay, girlfriend, voice"
                  />
                </label>
                <label className="field">
                  Availability
                  <select
                    value={profileEditForm.availability}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        availability: event.target.value,
                      }))
                    }
                  >
                    {profileEditForm.availability &&
                      !availabilityOptions.some(
                        (option) => option.value === profileEditForm.availability
                      ) && (
                        <option value={profileEditForm.availability}>
                          {profileEditForm.availability}
                        </option>
                      )}
                    {availabilityOptions.map((option) => (
                      <option key={option.value || "availability"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {profileEditStatus && (
              <p
                className={`helper ${
                  profileEditStatus.includes("Saved") || profileEditStatus.includes("✓")
                    ? ""
                    : "error"
                }`}
              >
                {profileEditStatus}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="cta ghost" onClick={closeProfileEdit}>
                Cancel
              </button>
              <button
                type="button"
                className={`cta primary ${profileEditSaving ? "loading" : ""}`}
                onClick={saveProfileEdit}
                disabled={profileEditSaving}
              >
                Save changes
              </button>
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
                <option value="wallet">Wallet balance</option>
              </select>
            </label>
            {bookingSheet.paymentMethod === "wallet" && (
              <p className="helper">
                Wallet balance: ₦{Number(profile?.user?.wallet_balance || 0).toLocaleString()}
              </p>
            )}
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
                <option value="wallet">Wallet balance</option>
              </select>
            </label>
            {extensionSheet.paymentMethod === "wallet" && (
              <p className="helper">
                Wallet balance: ₦{Number(profile?.user?.wallet_balance || 0).toLocaleString()}
              </p>
            )}
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
            {!modelApproved && (
              <div className="step-header">
                <div>
                  <p className="eyebrow">
                    Step {modelStep} of 3 · {Math.round((modelStep / 3) * 100)}%
                  </p>
                  <strong>
                    {modelStep === 1
                      ? "Profile setup"
                      : modelStep === 2
                      ? "Verification media"
                      : "Awaiting approval"}
                  </strong>
                </div>
                <div className="stepper">
                  <span className={modelStep >= 1 ? "step active" : "step"}>1</span>
                  <span className={modelStep >= 2 ? "step active" : "step"}>2</span>
                  <span className={modelStep >= 3 ? "step active" : "step"}>3</span>
                </div>
              </div>
            )}
            {modelApproved ? (
              <>
                <div className="flow-card profile-summary">
                  <div className="summary-head">
                    <span className="avatar">
                      {avatarUrl ? (
                        <img loading="lazy" decoding="async" src={avatarUrl} alt="Profile" />
                      ) : (
                        <span>{(profile?.model?.display_name || "M")[0]}</span>
                      )}
                    </span>
                    <div>
                      <strong>{profile?.model?.display_name || "Model"}</strong>
                      <p className="muted">
                        {profile?.model?.verification_status === "approved"
                          ? "Verified creator"
                          : "Verification pending"}
                      </p>
                    </div>
                    <span className="pill success">Live</span>
                  </div>
                  <div className="summary-grid">
                    <div>
                      <span className="eyebrow">Availability</span>
                      <strong>{profile?.model?.availability || "Flexible"}</strong>
                    </div>
                    <div>
                      <span className="eyebrow">Followers</span>
                      <strong>{followersStats?.total ?? 0}</strong>
                    </div>
                  </div>
                  <div className="summary-actions">
                    <button
                      type="button"
                      className="cta ghost"
                      onClick={() => setModelTab("profile")}
                    >
                      Edit profile
                    </button>
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() => setModelTab("sessions")}
                    >
                      View bookings
                    </button>
                  </div>
                </div>
                <div className="dash-actions tabs primary-nav">
                  <button
                    type="button"
                    className={`cta ${modelTab === "content" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("content")}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "sessions" && sessionListMode !== "chat" ? "primary" : "ghost"}`}
                    onClick={() => {
                      setModelTab("sessions");
                      setSessionListMode("all");
                    }}
                  >
                    Sessions
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "profile" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("profile")}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`cta ${modelTab === "earnings" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("earnings")}
                  >
                    Wallet
                  </button>
                  <label className="field tab-select nav-more">
                    More
                    <select
                      value={modelTab === "followers" ? "followers" : ""}
                      onChange={(event) => {
                        if (event.target.value === "followers") {
                          setModelTab("followers");
                        }
                      }}
                    >
                      <option value="">More…</option>
                      <option value="followers">Followers</option>
                    </select>
                  </label>
                </div>
                <div className="sync-row" data-sync-tick={syncTicker}>
                  <SyncIndicator
                    lastSyncedAt={syncMarks[currentSyncScope]}
                    active={pageVisible}
                    label="Last synced"
                  />
                </div>

                {modelTab === "profile" && (
                  <div className="flow-card">
                    <h3>Profile</h3>
                    {profileSavedStatus && (
                      <p className="helper success">{profileSavedStatus}</p>
                    )}
                    <div className="profile-progress">
                      <div className="line">
                        <span>Profile completion</span>
                        <strong>{profileChecklist.percent}%</strong>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${profileChecklist.percent}%` }} />
                      </div>
                      {profileChecklist.missing.length > 0 ? (
                        <ul className="checklist">
                          {profileChecklist.missing.map((item) => (
                            <li key={`missing-${item}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="helper">Profile complete ✅</p>
                      )}
                    </div>
                    <div className="avatar-row">
                      <div className="avatar">
                        {avatarUrl ? (
                          <img loading="lazy" decoding="async" src={avatarUrl} alt="Profile" />
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
                    {avatarPreviewUrl && (
                      <div className="avatar-cropper">
                        <div
                          className="avatar-crop-frame"
                          onPointerDown={handleAvatarDragStart}
                          onPointerMove={handleAvatarDragMove}
                          onPointerUp={handleAvatarDragEnd}
                          onPointerLeave={handleAvatarDragEnd}
                          onPointerCancel={handleAvatarDragEnd}
                        >
                          <img loading="lazy" decoding="async" src={avatarPreviewUrl}
                            alt="Crop preview"
                            style={{
                              transform: `translate(${avatarCrop.x}px, ${avatarCrop.y}px) scale(${avatarCrop.scale})`,
                            }}
                          />
                        </div>
                        <label className="field">
                          Zoom
                          <input
                            type="range"
                            min={avatarMinScale}
                            max={avatarMinScale * 3}
                            step="0.01"
                            value={avatarCrop.scale}
                            onChange={(event) => handleAvatarZoomChange(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="cta ghost"
                          onClick={() =>
                            setAvatarCrop({
                              scale: avatarMinScale,
                              x: (AVATAR_CROP_SIZE - avatarImageMeta.width * avatarMinScale) / 2,
                              y: (AVATAR_CROP_SIZE - avatarImageMeta.height * avatarMinScale) / 2,
                            })
                          }
                          disabled={!avatarImageMeta.width}
                        >
                          Reset crop
                        </button>
                      </div>
                    )}
                    <div className="line">
                      <span>Display name</span>
                      <strong>{profile?.model?.display_name || modelForm.stageName || "Model"}</strong>
                    </div>
                    <div className="line">
                      <span>Bio</span>
                      <strong>{profile?.model?.bio || "—"}</strong>
                    </div>
                    <div className="line">
                      <span>Tags</span>
                      <strong>
                        {Array.isArray(profile?.model?.tags)
                          ? profile.model.tags.map((tag) => cleanTagLabel(tag)).filter(Boolean).join(", ")
                          : profile?.model?.tags || "—"}
                      </strong>
                    </div>
                    <div className="line">
                      <span>Availability</span>
                      <strong>{profile?.model?.availability || "—"}</strong>
                    </div>
                    <div className="line">
                      <span>Email</span>
                      <strong>{profile?.user?.email || "-"}</strong>
                    </div>
                    <div className="line">
                      <span>Verification</span>
                      <strong>
                        {profile?.model?.verification_status === "approved"
                          ? "Approved"
                          : profile?.model?.verification_status || "Pending"}
                      </strong>
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
                      <span>Total teaser views</span>
                      <strong>{modelEngagementTotals.views}</strong>
                    </div>
                    <div className="line">
                      <span>Total teaser likes</span>
                      <strong>{modelEngagementTotals.likes}</strong>
                    </div>
                    <div className="line">
                      <span>Followers</span>
                      <strong>{profile?.user?.followers_count || 0}</strong>
                    </div>
                    <div className="line">
                      <span>Following</span>
                      <strong>{profile?.user?.following_count || 0}</strong>
                    </div>
                    <div className="field-row">
                      <label className="pill">
                        <input
                          type="checkbox"
                          checked={profile?.user?.privacy_hide_email ?? true}
                          onChange={(event) =>
                            updatePrivacy({
                              hideEmail: event.target.checked,
                              hideLocation: profile?.user?.privacy_hide_location ?? true,
                            })
                          }
                        />
                        Hide email
                      </label>
                      <label className="pill">
                        <input
                          type="checkbox"
                          checked={profile?.user?.privacy_hide_location ?? true}
                          onChange={(event) =>
                            updatePrivacy({
                              hideEmail: profile?.user?.privacy_hide_email ?? true,
                              hideLocation: event.target.checked,
                            })
                          }
                        />
                        Hide location
                      </label>
                    </div>
                    <div className="dash-actions">
                      <button type="button" className="cta primary alt" onClick={openProfileEdit}>
                        Edit profile
                      </button>
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={fetchBlockedList}
                        disabled={blockedListLoading}
                      >
                        {blockedListLoading ? "Loading…" : "Refresh blocklist"}
                      </button>
                    </div>
                    {blockedListStatus && <p className="helper error">{blockedListStatus}</p>}
                    {!blockedListLoading && blockedList.length > 0 && (
                      <div className="flow-card nested">
                        <h4>Blocked users</h4>
                        <p className="helper">
                          Blocked users can’t see your content, and you won’t see theirs.
                        </p>
                        {blockedList.map((item) => (
                          <div key={`blocked-model-${item.id}`} className="list-row">
                            <div className="gallery-user">
                                  <span className="avatar tiny">
                                    {item.avatar_url ? (
                                      <img loading="lazy" decoding="async" src={item.avatar_url} alt="User" />
                                    ) : (
                                      <span>{resolveDisplayName(item, "U")[0]}</span>
                                    )}
                                  </span>
                                  <div>
                                    <strong>{resolveDisplayName(item)}</strong>
                                    {item.verification_status === "approved" && (
                                      <span className="pill success">Verified</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="cta ghost"
                                  onClick={() =>
                                    requestBlockToggle(
                                      item.id,
                                      resolveDisplayName(item, "")
                                    )
                                  }
                                >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                            Publish at (optional)
                            <input
                              type="datetime-local"
                              value={contentForm.publishAt}
                              onChange={(event) =>
                                setContentForm((prev) => ({ ...prev, publishAt: event.target.value }))
                              }
                            />
                          </label>
                          <label className="field">
                            Expire at (optional)
                            <input
                              type="datetime-local"
                              value={contentForm.expiresAt}
                              onChange={(event) =>
                                setContentForm((prev) => ({ ...prev, expiresAt: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <p className="helper">
                          Leave publish blank to go live immediately after approval.
                        </p>
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
                            <div
                              key={`mine-${item.id}`}
                              id={`model-content-${item.id}`}
                              className="gallery-card"
                            >
                              <div className="gallery-media">
                                {item.preview_thumb_url || item.preview_url ? (
                                  item.content_type === "video" ? (
                                    <video
                                      src={item.preview_thumb_url || item.preview_url}
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={item.preview_thumb_url || item.preview_url}
                                      alt={item.title}
                                      loading="lazy"
                                      decoding="async"
                                    />
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
                                <div className="gallery-stats">
                                  <span className="pill ghost">
                                    {Number(item.views_count || 0)} views
                                  </span>
                                  <span className="pill ghost">
                                    {Number(item.likes_count || 0)} likes
                                  </span>
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
                    <div className="dash-actions">
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "all" ? "active" : ""}`}
                        onClick={() => setSessionListMode("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "calls" ? "active" : ""}`}
                        onClick={() => setSessionListMode("calls")}
                      >
                        Calls
                      </button>
                      <button
                        type="button"
                        className={`pill ${sessionListMode === "chat" ? "active" : ""}`}
                        onClick={() => setSessionListMode("chat")}
                      >
                        Chat sessions
                      </button>
                    </div>
                    {myBookingsStatus && <p className="helper error">{myBookingsStatus}</p>}
                    {myBookingsLoading && (
                      <div className="gallery-grid">
                        {Array.from({ length: 2 }).map((_, index) => (
                          <div key={`booking-skel-${index}`} className="gallery-card skeleton">
                            <div className="gallery-body">
                              <div className="skeleton-line wide" />
                              <div className="skeleton-line" />
                              <div className="skeleton-line short" />
                              <div className="skeleton-row">
                                <div className="skeleton-pill" />
                                <div className="skeleton-pill" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!myBookingsStatus && !myBookingsLoading && visibleModelBookings.length === 0 && (
                      <p className="helper">
                        {sessionListMode === "chat"
                          ? "No chat bookings yet."
                          : sessionListMode === "calls"
                          ? "No voice/video bookings yet."
                          : "No bookings yet."}
                      </p>
                    )}
                    {!myBookingsStatus && !myBookingsLoading && visibleModelBookings.length > 0 && (
                      <div className="gallery-grid">
                        {visibleModelBookings.map((item) => (
                          <div
                            key={`booking-${item.id}`}
                            id={`model-booking-${item.id}`}
                            className="gallery-card"
                          >
                              <div className="gallery-body">
                                <h4>{item.session_type || "Session"}</h4>
                              <span className={`pill ${getStatusTone(item.status)}`}>
                                {formatSessionStatus(item.status || "pending")}
                              </span>
                                <div className="gallery-meta">
                                  <span>{item.client_label || "Client"}</span>
                                  <strong>{item.duration_minutes || "-"} mins</strong>
                                </div>
                                <div className="session-timeline">
                                  <span className="timeline-dot" />
                                  <span>{formatSessionTime(item)}</span>
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
                                    className={`cta primary start ${
                                      sessionActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    onClick={() => handleSessionJoin(item)}
                                    disabled={sessionActionStatus[item.id]?.loading}
                                  >
                                    {item.session_type === "chat" ? "Open chat" : "Start session"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`cta danger ${
                                      bookingActionStatus[item.id]?.loading ? "loading" : ""
                                    }`}
                                    onClick={() => requestModelSessionCancel(item.id)}
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
                                <>
                                  <p className="helper error">
                                    {sessionActionStatus[item.id]?.error}
                                  </p>
                                  <div className="gallery-actions retry-row">
                                    <button
                                      type="button"
                                      className="cta ghost"
                                      onClick={() => handleSessionJoin(item)}
                                    >
                                      Retry
                                    </button>
                                    {item.session_type !== "chat" && (
                                      <button
                                        type="button"
                                        className="cta ghost"
                                        onClick={() => openPermissionCheck(item.session_type)}
                                      >
                                        Check permissions
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                              {sessionActionStatus[item.id]?.info && (
                                <p className="helper">
                                  {sessionActionStatus[item.id]?.info}
                                </p>
                              )}
                              {item.status === "disputed" && (
                                <div className="dispute-timeline">
                                  <strong>Dispute timeline</strong>
                                  <span>1. Session ended before scheduled completion.</span>
                                  <span>2. Escrow moved to dispute for admin review.</span>
                                  <span>3. Admin decision updates wallet or payout.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {myBookingsHasMore && !myBookingsLoading && (
                      <div className="dash-actions">
                        <button
                          type="button"
                          className={`cta ghost ${myBookingsLoadingMore ? "loading" : ""}`}
                          onClick={loadMoreBookings}
                          disabled={myBookingsLoadingMore}
                        >
                          {myBookingsLoadingMore ? "Loading…" : "Load more"}
                        </button>
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

                {modelTab === "followers" && (
                  <div className="flow-card">
                    <h3>Your Followers</h3>
                    {followersStats && (
                      <div className="metric-grid">
                        <div className="metric-card">
                          <span>Total followers</span>
                          <strong>{followersStats.total}</strong>
                        </div>
                        <div className="metric-card">
                          <span>New (7 days)</span>
                          <strong>{followersStats.last_7d}</strong>
                        </div>
                        <div className="metric-card">
                          <span>Growth (7 days)</span>
                          <strong>{followersStats.growth_7d >= 0 ? "+" : ""}{followersStats.growth_7d}</strong>
                        </div>
                        <div className="metric-card">
                          <span>New (30 days)</span>
                          <strong>{followersStats.last_30d}</strong>
                        </div>
                      </div>
                    )}
                    <div className="dash-actions">
                      <button
                        type="button"
                        className={`cta ${followersFilter === "all" ? "primary" : "ghost"}`}
                        onClick={() => setFollowersFilter("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`cta ${followersFilter === "online" ? "primary" : "ghost"}`}
                        onClick={() => setFollowersFilter("online")}
                      >
                        Online
                      </button>
                      <button
                        type="button"
                        className={`cta ${followersFilter === "offline" ? "primary" : "ghost"}`}
                        onClick={() => setFollowersFilter("offline")}
                      >
                        Offline
                      </button>
                    </div>
                    {followersStatus && <p className="helper error">{followersStatus}</p>}
                    {!followersStatus && followers.length === 0 && (
                      <p className="helper">No followers yet.</p>
                    )}
                    {!followersStatus && followers.length > 0 && filteredFollowers.length === 0 && (
                      <p className="helper">No followers match this filter.</p>
                    )}
                    {!followersStatus && filteredFollowers.length > 0 && (
                      <div className="gallery-grid">
                        {filteredFollowers.map((item) => (
                          <div key={`follower-${item.id}`} className="gallery-card">
                            <div className="gallery-body">
                              <div className="list-row">
                                <div className="avatar small">
                                  {item.avatar_url ? (
                                    <img loading="lazy" decoding="async" src={item.avatar_url} alt="Follower" />
                                  ) : (
                                    <span>{resolveDisplayName(item, "U")[0]}</span>
                                  )}
                                </div>
                                <div>
                                  <strong>{resolveDisplayName(item)}</strong>
                                  <p className="muted">{item.role || "user"}</p>
                                </div>
                              </div>
                              <div className="gallery-actions">
                                <span className={`pill ${item.is_online ? "success" : ""}`}>
                                  {formatPresence(item.is_online, item.last_seen_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                        onChange={(event) => updateModelField("stageName", event.target.value)}
                        placeholder="Jesse Belle"
                      />
                      {modelErrors.stageName && (
                        <p className="field-error">{modelErrors.stageName}</p>
                      )}
                    </label>
                    <label className="field">
                      Email
                      <input
                        type="email"
                        value={modelForm.email}
                        onChange={(event) => updateModelField("email", event.target.value)}
                      placeholder="you@email.com"
                    />
                      <p className="field-hint">Why we ask: payouts and verification updates.</p>
                      {modelErrors.email && (
                        <p className="field-error">{modelErrors.email}</p>
                      )}
                    </label>
                    {renderLocationFields({
                      countryIso: modelCountryIso,
                      regionName: modelRegionName,
                      regionData: modelRegionData,
                      onCountryChange: (value) => {
                        setModelCountryIso(value);
                        setModelLocationDirty(true);
                        setModelErrors((prev) => ({ ...prev, country: "", region: "" }));
                      },
                      onRegionChange: (value) => {
                        setModelRegionName(value);
                        setModelLocationDirty(true);
                        setModelErrors((prev) => ({ ...prev, region: "" }));
                      },
                      idPrefix: "model-onboarding",
                    })}
                    <p className="field-hint">
                      Why we ask: to show clients your region and comply with local rules.
                    </p>
                    {modelErrors.country && (
                      <p className="field-error">{modelErrors.country}</p>
                    )}
                    {modelErrors.region && (
                      <p className="field-error">{modelErrors.region}</p>
                    )}
                    <label className="field">
                      Availability
                      <select
                        value={modelForm.availability}
                        onChange={(event) =>
                          updateModelField("availability", event.target.value)
                        }
                      >
                        {availabilityOptions.map((option) => (
                          <option key={option.value || "availability"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {modelErrors.availability && (
                        <p className="field-error">{modelErrors.availability}</p>
                      )}
                    </label>
                    <div className="field-row">
                      <label className="field">
                        Birth month
                        <select
                          value={modelForm.birthMonth}
                          onChange={(event) =>
                            updateModelField("birthMonth", event.target.value)
                          }
                        >
                          {birthMonthOptions.map((option) => (
                            <option key={option.value || "month"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {modelErrors.birthMonth && (
                          <p className="field-error">{modelErrors.birthMonth}</p>
                        )}
                      </label>
                      <label className="field">
                        Birth year
                        <select
                          value={modelForm.birthYear}
                          onChange={(event) =>
                            updateModelField("birthYear", event.target.value)
                          }
                        >
                          {birthYearOptions.map((option) => (
                            <option key={option.value || "year"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {modelErrors.birthYear && (
                          <p className="field-error">{modelErrors.birthYear}</p>
                        )}
                      </label>
                    </div>
                    <p className="field-hint">
                      Why we ask: to confirm you are 18+. This stays private.
                    </p>
                    {modelErrors.ageGate && (
                      <p className="field-error">{modelErrors.ageGate}</p>
                    )}
                    <label className="field">
                      Short bio
                      <textarea
                        rows="3"
                        value={modelForm.bio}
                        onChange={(event) => updateModelField("bio", event.target.value)}
                        placeholder="Describe your vibe, services, and boundaries."
                      />
                      {modelErrors.bio && <p className="field-error">{modelErrors.bio}</p>}
                    </label>
                    <label className="field">
                      Tags
                      <input
                        type="text"
                        value={modelForm.tags}
                        onChange={(event) => updateModelField("tags", event.target.value)}
                        placeholder="Roleplay, Girlfriend, Voice, Video"
                      />
                      {modelErrors.tags && <p className="field-error">{modelErrors.tags}</p>}
                    </label>
                    <div className="notice-card agreement-box">
                      <h4>Compliance & Data Use Agreement</h4>
                      <p className="helper">
                        By continuing, you confirm you are 18+ and will not use Velvet Rooms for
                        illegal activity, exploitation, trafficking, or non-consensual content.
                      </p>
                      <p className="helper">
                        We use account, profile, verification media, payment, and usage data to
                        operate the platform, prevent abuse, resolve disputes, and comply with law.
                        We only share data with required service providers (payments and storage) or
                        when legally required.
                      </p>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={modelForm.disclaimerAccepted}
                          onChange={(event) =>
                            updateModelField("disclaimerAccepted", event.target.checked)
                          }
                        />
                        <span>
                          I agree to the Compliance & Data Use Agreement (v{DISCLAIMER_VERSION}).
                        </span>
                      </label>
                      {modelErrors.disclaimer && (
                        <p className="field-error">{modelErrors.disclaimer}</p>
                      )}
                    </div>
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
