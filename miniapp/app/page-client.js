"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Country, State, City } from "country-state-city";

const DISCLAIMER_VERSION = "2026-01-31";
const AGE_GATE_STORAGE_KEY = "vr_age_confirmed";
const ONBOARDING_VERSION = "2026-02-10";
const ONBOARDING_STORAGE_KEY = "vr_onboarding_seen";

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

  const countries = useMemo(() => {
    const list = Country.getAllCountries() || [];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

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
    const states = State.getStatesOfCountry(countryIso) || [];
    if (states.length) {
      return {
        kind: "state",
        items: states
          .map((state) => normalizeName(state.name))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
      };
    }
    const cities = City.getCitiesOfCountry(countryIso) || [];
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
  const [callState, setCallState] = useState({
    open: false,
    sessionId: null,
    sessionType: "",
    status: "",
    connecting: false,
    micMuted: false,
    cameraOff: false,
    peerReady: false,
  });
  const [callMessages, setCallMessages] = useState([]);
  const [callInput, setCallInput] = useState("");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callPcRef = useRef(null);
  const callChannelRef = useRef(null);
  const offerSentRef = useRef(false);
  const callUserIdRef = useRef(null);
  const callRemoteIdRef = useRef(null);
  const callReadyTimerRef = useRef(null);
  const callSessionRef = useRef({ id: null, type: null });
  const [clientDeleteStatus, setClientDeleteStatus] = useState("");
  const [avatarState, setAvatarState] = useState({
    file: null,
    name: "",
    status: "",
    uploading: false,
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
          "One-time access fee in escrow. Payments are held safely until admin approval.",
        cta: "Get Started",
        visual: "access",
        image: "/onboarding/access.png",
        points: [
          "Escrow-protected payments",
          "Admin approval required",
        ],
      },
    ],
    []
  );
  const onboardingTotal = onboardingSlides.length;
  const onboardingCurrent = onboardingSlides[Math.min(onboardingStep, onboardingTotal - 1)];
  const [profileEditStatus, setProfileEditStatus] = useState("");
  const [profileEditSaving, setProfileEditSaving] = useState(false);
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

  const filteredFollowers = followers.filter((item) => {
    if (followersFilter === "online") {
      return item.is_online;
    }
    if (followersFilter === "offline") {
      return !item.is_online;
    }
    return true;
  });
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
      setBookingActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info:
            action === "accept"
              ? "Session accepted. Open the session to start."
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

  const appendCallMessage = (message) => {
    setCallMessages((prev) => {
      const next = [...prev, message];
      return next.length > 100 ? next.slice(next.length - 100) : next;
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

  const cleanupCall = (notifyRemote = true, resetState = true) => {
    if (notifyRemote) {
      sendCallSignal({ type: "hangup" }).catch(() => null);
    }
    const channel = callChannelRef.current;
    if (channel) {
      channel.unsubscribe().catch(() => null);
    }
    callChannelRef.current = null;
    callRemoteIdRef.current = null;
    callUserIdRef.current = null;
    callSessionRef.current = { id: null, type: null };
    if (callReadyTimerRef.current) {
      clearInterval(callReadyTimerRef.current);
      callReadyTimerRef.current = null;
    }
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
      setCallInput("");
      setCallState((prev) => ({
        ...prev,
        open: false,
        sessionId: null,
        sessionType: "",
        status: "",
        connecting: false,
        micMuted: false,
        cameraOff: false,
        peerReady: false,
      }));
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
    if (payload.type === "ready") {
      callRemoteIdRef.current = payload.userId || null;
      if (callReadyTimerRef.current) {
        clearInterval(callReadyTimerRef.current);
        callReadyTimerRef.current = null;
      }
      setCallState((prev) => ({
        ...prev,
        peerReady: true,
        status: prev.status || "Partner connected.",
      }));
      const pc = callPcRef.current;
      if (pc && localUserId && payload.userId && localUserId < payload.userId) {
        if (!offerSentRef.current) {
          offerSentRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendCallSignal({ type: "offer", sdp: pc.localDescription });
        }
      }
      return;
    }
    if (payload.type === "hangup") {
      cleanupCall(false);
      return;
    }
    const pc = callPcRef.current;
    if (!pc) {
      return;
    }
    if (payload.type === "offer" && payload.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal({ type: "answer", sdp: pc.localDescription });
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

  const startCall = async (sessionId, sessionType) => {
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
    callSessionRef.current = { id: sessionId, type: sessionType };
    setCallState((prev) => ({ ...prev, connecting: true, status: "Connecting…" }));

    const channel = supabaseClient.channel(`vr-call-${sessionId}`, {
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
      appendCallMessage({
        id: payload.id || `${payload.senderId}-${payload.sentAt || Date.now()}`,
        senderId: payload.senderId,
        senderLabel: payload.senderLabel || "Partner",
        text: payload.text || "",
        sentAt: payload.sentAt || new Date().toISOString(),
        self: false,
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        sendCallSignal({ type: "ready" }).catch(() => null);
        if (callReadyTimerRef.current) {
          clearInterval(callReadyTimerRef.current);
        }
        callReadyTimerRef.current = setInterval(() => {
          sendCallSignal({ type: "ready" }).catch(() => null);
        }, 3000);
        if (sessionType === "chat") {
          setCallState((prev) => ({
            ...prev,
            connecting: false,
            status: "Chat ready.",
          }));
        }
      }
    });

    if (sessionType === "chat") {
      return;
    }

    setCallState((prev) => ({ ...prev, status: "Requesting microphone/camera…" }));
    const iceRes = await fetch("/api/calls/ice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    if (!iceRes.ok) {
      setCallState((prev) => ({
        ...prev,
        connecting: false,
        status: "Unable to get TURN credentials.",
      }));
      return;
    }
    const icePayload = await iceRes.json();
    const iceServers = icePayload?.iceServers || [];

    const pc = new RTCPeerConnection({ iceServers });
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
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate }).catch(() => null);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Connected.",
        }));
      }
      if (pc.connectionState === "failed") {
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Connection failed. Try again.",
        }));
      }
      if (pc.connectionState === "disconnected") {
        setCallState((prev) => ({
          ...prev,
          connecting: false,
          status: "Disconnected.",
        }));
      }
    };

    try {
      const constraints = {
        audio: true,
        video: sessionType === "video",
      };
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      if (sessionType === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
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
    }
  };

  const startSessionCall = async (sessionId, sessionType) => {
    if (!initData || !sessionId) {
      return;
    }
    const resolvedType = sessionType || "video";
    setCallState({
      open: true,
      sessionId,
      sessionType: resolvedType,
      status: "",
      connecting: true,
      micMuted: false,
      cameraOff: false,
      peerReady: false,
    });
    setCallMessages([]);
    setCallInput("");
    await startCall(sessionId, resolvedType);
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
    const senderId = callUserIdRef.current;
    const payload = {
      id: `${senderId || "me"}-${Date.now()}`,
      senderId,
      senderLabel: profile?.user?.public_id || profile?.user?.username || "You",
      text: message,
      sentAt: new Date().toISOString(),
    };
    await callChannelRef.current.send({
      type: "broadcast",
      event: "chat",
      payload,
    });
    appendCallMessage({ ...payload, self: true });
    setCallInput("");
  };

  const handleSessionJoin = async (sessionId, sessionType) => {
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
      setSessionActionStatus((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          error: "",
          info: "Opening session…",
        },
      }));
      await startSessionCall(sessionId, sessionType);
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
    if (!initData || role !== "model" || !modelApproved) {
      return;
    }
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
        } catch {
          setFollowersStatus("Unable to load followers.");
          setFollowers([]);
          setFollowersStats(null);
        }
      };
      loadFollowers();
    }
  }, [initData, role, modelApproved, modelTab]);

  useEffect(() => {
    if (!initData || role !== "client" || clientTab !== "following") {
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
        setFollowingLoading(false);
      } catch {
        setFollowingStatus("Unable to load follows.");
        setFollowing([]);
        setFollowingLoading(false);
      }
    };
    loadFollowing();
  }, [initData, role, clientTab]);

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
          setOnboardingComplete(false);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("vr_role");
            window.localStorage.removeItem("vr_role_locked");
            window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
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
    } catch {
      // ignore
    }
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

  const openReportDialog = (targetId, targetLabel) => {
    setReportDialog({
      open: true,
      targetId,
      targetLabel: targetLabel || "",
      selectedReason: "",
      expanded: "",
      details: "",
      status: "",
      submitting: false,
    });
  };

  const closeReportDialog = () => {
    setReportDialog((prev) => ({ ...prev, open: false, submitting: false, status: "" }));
  };

  const reportReasons = useMemo(
    () => [
      { key: "spam", label: "Spam", desc: "Mass messaging, repetitive links, or unwanted promotions." },
      { key: "harassment", label: "Harassment", desc: "Threats, hate speech, or targeted abuse." },
      { key: "impersonation", label: "Impersonation", desc: "Pretending to be someone else." },
      { key: "fraud", label: "Fraud / Scam", desc: "Payment deception, fake identity, or chargeback abuse." },
      { key: "stolen_content", label: "Stolen content", desc: "Posting content without rights/permission." },
      { key: "underage", label: "Underage concern", desc: "Anything that suggests a user may be under 18." },
      { key: "other", label: "Other", desc: "Something else not listed." },
    ],
    []
  );

  const submitReportDialog = async () => {
    if (!reportDialog.targetId) {
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
    const ok = await reportCreator(reportDialog.targetId, payloadReason);
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
    setCreatorOverlay({ open: true, creator: { ...item, model_id: modelId } });
  };

  const closeCreator = () => {
    setCreatorOverlay({ open: false, creator: null });
  };

  const reportCreator = async (targetId, reason = "") => {
    if (!initData || !targetId) {
      return false;
    }
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, target_id: targetId, reason }),
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
      username: user.username || client.display_name || "",
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
      setProfileEditStatus("Saved ✅");
      setTimeout(() => closeProfileEdit(), 600);
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
    if (clientStep === 1 && !clientCountryIso) {
      setClientStatus("Select your country to continue.");
      return;
    }
    if (clientStep === 1 && clientRegionData.items.length && !clientRegionName) {
      setClientStatus("Select your city/region to continue.");
      return;
    }
    if (clientStep === 1 && !ageGateConfirmed) {
      openAgeGate("client");
      setClientStatus("Confirm you are 18+ to continue.");
      return;
    }
    if (clientStep === 1 && !clientForm.disclaimerAccepted) {
      setClientStatus("You must accept the agreement to continue.");
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
    if (modelStep === 1 && !modelCountryIso) {
      setModelStatus("Select your country to continue.");
      return;
    }
    if (modelStep === 1 && modelRegionData.items.length && !modelRegionName) {
      setModelStatus("Select your city/region to continue.");
      return;
    }
    if (modelStep === 1 && !modelForm.availability) {
      setModelStatus("Add your availability to continue.");
      return;
    }
    if (modelStep === 1 && !modelForm.bio) {
      setModelStatus("Add a short bio to continue.");
      return;
    }
    if (modelStep === 1 && !modelForm.tags) {
      setModelStatus("Add at least one tag to continue.");
      return;
    }
    if (modelStep === 1 && !ageGateConfirmed) {
      openAgeGate("model");
      setModelStatus("Confirm you are 18+ to continue.");
      return;
    }
    if (modelStep === 1 && !modelForm.disclaimerAccepted) {
      setModelStatus("You must accept the agreement to continue.");
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
          <div className="brand brand-logo-only">
            <span className="logo-mark">
              <img src="/brand/logo.png" alt="Velvet Rooms logo" />
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
            <img src="/brand/logo.png" alt="Velvet Rooms logo" />
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
                  Step {onboardingStep + 1} of {onboardingTotal}
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
                <img src={onboardingCurrent.image} alt={onboardingCurrent.title} />
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

      {!role && !roleLocked && !showOnboarding && (
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
                    {renderLocationFields({
                      countryIso: clientCountryIso,
                      regionName: clientRegionName,
                      regionData: clientRegionData,
                      onCountryChange: (value) => {
                        setClientCountryIso(value);
                        setClientLocationDirty(true);
                      },
                      onRegionChange: (value) => {
                        setClientRegionName(value);
                        setClientLocationDirty(true);
                      },
                      idPrefix: "client-onboarding",
                    })}
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
                            setClientForm((prev) => ({
                              ...prev,
                              disclaimerAccepted: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          I agree to the Compliance & Data Use Agreement (v{DISCLAIMER_VERSION}).
                        </span>
                      </label>
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
                    className={`cta ${clientTab === "following" ? "primary" : "ghost"}`}
                    onClick={() => setClientTab("following")}
                  >
                    Following
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
                    <div className="dash-actions">
                      <button
                        type="button"
                        className="cta ghost"
                        onClick={refreshGalleryAccess}
                      >
                        Refresh gallery
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
                                    <span className="pill spotlight">Spotlight</span>
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
                                      <img src={item.avatar_url} alt="Creator" />
                                    ) : (
                                      <span>{(item.display_name || item.public_id || "M")[0]}</span>
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
                                  className={`pill ghost ${item.has_liked ? "active" : ""}`}
                                  onClick={() => toggleLike(item.id)}
                                >
                                  {Number(item.likes_count || 0)} likes
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
                                  className={`cta ghost ${item.is_following ? "active" : ""} ${
                                    followState[item.model_id]?.loading ? "loading" : ""
                                  }`}
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
                    )}
                  </div>
                )}

                {clientTab === "profile" && (
                  <div className="flow-card">
                    <h3>Your Profile</h3>
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
                                  <img src={item.avatar_url} alt="User" />
                                ) : (
                                  <span>{(item.username || item.public_id || "U")[0]}</span>
                                )}
                              </span>
                              <div>
                                <strong>{item.model_display_name || item.username || item.public_id}</strong>
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
                                  item.model_display_name || item.username || item.public_id || ""
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
                    {followingStatus && <p className="helper error">{followingStatus}</p>}
                    {followingLoading && <p className="helper">Loading creators…</p>}
                    {!followingLoading && !followingStatus && following.length === 0 && (
                      <p className="helper">
                        You’re not following anyone yet. Follow a creator to see them here.
                      </p>
                    )}
                    {!followingLoading &&
                      following.map((creator) => (
                        <div key={`follow-${creator.id}`} className="list-row">
                          <div className="gallery-user">
                            <span className="avatar tiny">
                              {creator.avatar_url ? (
                                <img src={creator.avatar_url} alt="Creator" />
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
                            {creator.is_online && <span className="pill success">Online</span>}
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
                              onClick={() => handleSessionJoin(item.id, item.session_type)}
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

      {callState.open && (
        <section className="call-overlay">
          <div className="call-card">
            <header>
              <div>
                <p className="eyebrow">
                  {callState.sessionType === "chat"
                    ? "Private chat"
                    : `${callState.sessionType || "session"} call`}
                </p>
                <h3>
                  {callState.sessionType === "video"
                    ? "Video session"
                    : callState.sessionType === "voice"
                    ? "Voice session"
                    : "Chat session"}
                </h3>
                {callState.status && <p className="helper">{callState.status}</p>}
              </div>
              <button type="button" className="cta ghost" onClick={() => cleanupCall(true)}>
                End
              </button>
            </header>
            <div
              className={`call-body ${
                callState.sessionType === "chat" ? "chat-only" : ""
              }`}
            >
              {callState.sessionType !== "chat" && (
                <div className="call-media">
                  {callState.sessionType === "video" && (
                    <div className="call-video-grid">
                      <div className="call-video remote">
                        <video ref={remoteVideoRef} autoPlay playsInline />
                        <span className="call-label">Partner</span>
                      </div>
                      <div className="call-video local">
                        <video ref={localVideoRef} autoPlay muted playsInline />
                        <span className="call-label">You</span>
                      </div>
                    </div>
                  )}
                  {callState.sessionType === "voice" && (
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
                  {callState.sessionType === "voice" && (
                    <audio ref={remoteAudioRef} autoPlay />
                  )}
                </div>
              )}
              <div className="call-chat">
                <div className="chat-log">
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
                    </div>
                  ))}
                </div>
                <div className="chat-input">
                  <input
                    type="text"
                    value={callInput}
                    onChange={(event) => setCallInput(event.target.value)}
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
            {callState.sessionType !== "chat" && (
              <div className="call-controls">
                <button type="button" className="cta ghost" onClick={toggleMute}>
                  {callState.micMuted ? "Unmute" : "Mute"}
                </button>
                {callState.sessionType === "video" && (
                  <button type="button" className="cta ghost" onClick={toggleCamera}>
                    {callState.cameraOff ? "Camera on" : "Camera off"}
                  </button>
                )}
                <button type="button" className="cta danger" onClick={() => cleanupCall(true)}>
                  End call
                </button>
              </div>
            )}
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
                {Number(previewOverlay.item.likes_count || 0)} likes
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
                <img src={previewOverlay.item.preview_url} alt={previewOverlay.item.title} />
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
                    <img src={creatorOverlay.creator.avatar_url} alt="Creator" />
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
              <h3>Report {reportDialog.targetLabel || "user"}</h3>
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
        <section className="modal-backdrop" onClick={closeProfileEdit}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>Edit profile</h3>
              <button type="button" className="cta ghost" onClick={closeProfileEdit}>
                Close
              </button>
            </header>
            {role === "client" && (
              <>
                <label className="field">
                  Username
                  <input
                    value={profileEditForm.username}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    placeholder="Choose a unique username"
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
                    <input
                      value={profileEditForm.birthMonth}
                      onChange={(event) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          birthMonth: event.target.value,
                        }))
                      }
                      placeholder="MM"
                    />
                  </label>
                  <label className="field">
                    Birth year
                    <input
                      value={profileEditForm.birthYear}
                      onChange={(event) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          birthYear: event.target.value,
                        }))
                      }
                      placeholder="YYYY"
                    />
                  </label>
                </div>
                <p className="helper">18+ only. Birth details stay private.</p>
              </>
            )}
            {role === "model" && (
              <>
                <label className="field">
                  Stage name
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
                  Bio
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
                  <input
                    value={profileEditForm.availability}
                    onChange={(event) =>
                      setProfileEditForm((prev) => ({
                        ...prev,
                        availability: event.target.value,
                      }))
                    }
                    placeholder="e.g. nights, weekends, by request"
                  />
                </label>
              </>
            )}
            {profileEditStatus && (
              <p className={`helper ${profileEditStatus.includes("✅") ? "" : "error"}`}>
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
                  <button
                    type="button"
                    className={`cta ${modelTab === "followers" ? "primary" : "ghost"}`}
                    onClick={() => setModelTab("followers")}
                  >
                    Followers
                  </button>
                </div>

                {modelTab === "profile" && (
                  <div className="flow-card">
                    <h3>Profile</h3>
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
                                  <img src={item.avatar_url} alt="User" />
                                ) : (
                                  <span>{(item.username || item.public_id || "U")[0]}</span>
                                )}
                              </span>
                              <div>
                                <strong>{item.model_display_name || item.username || item.public_id}</strong>
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
                                  item.model_display_name || item.username || item.public_id || ""
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
                                    onClick={() => handleSessionJoin(item.id, item.session_type)}
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
                                    <img src={item.avatar_url} alt="Follower" />
                                  ) : (
                                    <span>{(item.display_name || item.username || "U")[0]}</span>
                                  )}
                                </div>
                                <div>
                                  <strong>{item.display_name || item.username || item.public_id}</strong>
                                  <p className="muted">{item.role || "user"}</p>
                                </div>
                              </div>
                              <div className="gallery-actions">
                                <span className={`pill ${item.is_online ? "success" : ""}`}>
                                  {item.is_online ? "Online" : "Offline"}
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
                    {renderLocationFields({
                      countryIso: modelCountryIso,
                      regionName: modelRegionName,
                      regionData: modelRegionData,
                      onCountryChange: (value) => {
                        setModelCountryIso(value);
                        setModelLocationDirty(true);
                      },
                      onRegionChange: (value) => {
                        setModelRegionName(value);
                        setModelLocationDirty(true);
                      },
                      idPrefix: "model-onboarding",
                    })}
                    <label className="field">
                      Availability
                      <input
                        type="text"
                        value={modelForm.availability}
                        onChange={(event) =>
                          setModelForm((prev) => ({
                            ...prev,
                            availability: event.target.value,
                          }))
                        }
                        placeholder="Weeknights · 8pm-12am"
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
                            setModelForm((prev) => ({
                              ...prev,
                              disclaimerAccepted: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          I agree to the Compliance & Data Use Agreement (v{DISCLAIMER_VERSION}).
                        </span>
                      </label>
                    </div>
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
                    <label className="field">
                      Tags
                      <input
                        type="text"
                        value={modelForm.tags}
                        onChange={(event) =>
                          setModelForm((prev) => ({ ...prev, tags: event.target.value }))
                        }
                        placeholder="Roleplay, Girlfriend, Voice, Video"
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
