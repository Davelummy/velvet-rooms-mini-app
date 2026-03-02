"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLiveStore } from "../../_store/useLiveStore";
import { useHaptic } from "../../_hooks/useHaptic";
import { api } from "../../_lib/apiClient";
import { formatNgn } from "../../_lib/formatters";
import LiveViewerCount from "./LiveViewerCount";
import LiveChat from "./LiveChat";
import LiveGiftAnimation from "./LiveGiftAnimation";
import LiveGiftersLeaderboard from "./LiveGiftersLeaderboard";
import GiftPicker from "../gifts/GiftPicker";

// Agora is browser-only — always dynamic imported
let AgoraRTC = null;

async function getAgoraRTC() {
  if (!AgoraRTC) {
    const mod = await import("agora-rtc-sdk-ng");
    AgoraRTC = mod.default;
    AgoraRTC.setLogLevel(3); // warn only
  }
  return AgoraRTC;
}

export default function LiveRoom({ open, onClose, isHost = false }) {
  const {
    currentStream,
    setViewerCount,
    setPeakViewers,
    addChatMessage,
    addGift,
    resetLive,
    setLeaderboard,
  } = useLiveStore();

  const { notification } = useHaptic();

  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [joinState, setJoinState] = useState("idle"); // idle | joining | joined | error
  const [joinError, setJoinError] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [muted, setMuted] = useState(false);

  // ── JOIN ─────────────────────────────────────────────────────────────────
  const joinChannel = useCallback(async () => {
    if (!currentStream || joinState === "joined" || joinState === "joining") return;
    setJoinState("joining");
    setJoinError(null);

    try {
      const sdk = await getAgoraRTC();

      // Get token from server
      let tokenData;
      if (isHost) {
        // Token was already returned in /api/live/start response
        tokenData = {
          agora_app_id: currentStream.agora_app_id,
          agora_token: currentStream.agora_token,
          agora_uid: currentStream.agora_uid,
          agora_channel: currentStream.agora_channel,
        };
      } else {
        tokenData = await api.post(`/api/live/${currentStream.id}/join`, {});
      }

      const { agora_app_id, agora_token, agora_uid, agora_channel } = tokenData;

      // Create client
      const client = sdk.createClient({ mode: "live", codec: "vp8" });
      clientRef.current = client;

      // Set role
      await client.setClientRole(isHost ? "host" : "audience");

      // Viewer count tracking
      client.on("user-joined", () => {
        const count = client.remoteUsers.length + (isHost ? 0 : 1);
        setViewerCount(count);
        setPeakViewers(count);
      });
      client.on("user-left", () => {
        const count = client.remoteUsers.length;
        setViewerCount(count);
      });

      // Audience: subscribe when host publishes
      if (!isHost) {
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video" && remoteVideoRef.current) {
            user.videoTrack.play(remoteVideoRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack.play();
          }
        });
        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "video" && remoteVideoRef.current) {
            remoteVideoRef.current.innerHTML = "";
          }
        });
      }

      // Join the channel
      await client.join(agora_app_id, agora_channel, agora_token, agora_uid);

      // Host: create and publish local tracks
      if (isHost) {
        const [audioTrack, videoTrack] = await sdk.createMicrophoneAndCameraTracks(
          {},
          { encoderConfig: "480p_1" }
        );
        localTracksRef.current = { audio: audioTrack, video: videoTrack };
        await client.publish([audioTrack, videoTrack]);
        if (localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }
      }

      setJoinState("joined");
      notification("success");
    } catch (err) {
      console.error("Agora join error:", err);
      setJoinError(err.message || "Failed to join stream");
      setJoinState("error");
      notification("error");
    }
  }, [currentStream, isHost, joinState, notification, setViewerCount, setPeakViewers]);

  // ── LEAVE ────────────────────────────────────────────────────────────────
  const leaveChannel = useCallback(async () => {
    try {
      const { audio, video } = localTracksRef.current;
      audio?.close();
      video?.close();
      localTracksRef.current = { audio: null, video: null };
      await clientRef.current?.leave();
      clientRef.current = null;
    } catch {}
  }, []);

  // Auto-join when open
  useEffect(() => {
    if (open && currentStream) {
      joinChannel();
    }
    return () => {
      if (!open) leaveChannel();
    };
  }, [open, currentStream]);

  // ── CONTROLS ─────────────────────────────────────────────────────────────
  const toggleMute = () => {
    const track = localTracksRef.current.audio;
    if (!track) return;
    const next = !muted;
    track.setEnabled(!next);
    setMuted(next);
  };

  const toggleCamera = () => {
    const track = localTracksRef.current.video;
    if (!track) return;
    const next = !cameraOff;
    track.setEnabled(!next);
    setCameraOff(next);
  };

  // ── END STREAM ───────────────────────────────────────────────────────────
  const handleEnd = async () => {
    await leaveChannel();
    try {
      await api.post("/api/live/end", { streamId: currentStream?.id });
      notification("success");
    } catch {}
    resetLive();
    onClose?.();
  };

  const handleLeave = async () => {
    // Mark viewer as left
    if (currentStream?.id) {
      api.post(`/api/live/${currentStream.id}/leave`, {}).catch(() => {});
    }
    await leaveChannel();
    resetLive();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 100 }}>

      {/* ── Video area ─────────────────────────────────────────────────── */}
      {isHost ? (
        // Host sees their own camera
        <div
          ref={localVideoRef}
          style={{ position: "absolute", inset: 0, background: "#111" }}
        />
      ) : (
        // Audience sees the host
        <div
          ref={remoteVideoRef}
          style={{ position: "absolute", inset: 0, background: "#111" }}
        />
      )}

      {/* Joining overlay */}
      {joinState === "joining" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 5 }}>
          <div style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: "15px" }}>{isHost ? "Starting your stream…" : "Joining stream…"}</div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {joinState === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 5 }}>
          <div style={{ textAlign: "center", color: "#fff", padding: "24px" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
            <div style={{ fontSize: "15px", marginBottom: "20px" }}>{joinError || "Connection failed"}</div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={joinChannel} style={{ padding: "10px 20px", borderRadius: "12px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>Retry</button>
              <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "none", color: "#fff", cursor: "pointer" }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: "env(safe-area-inset-top, 16px)",
        left: "16px",
        right: "16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 10,
      }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ background: "var(--accent)", color: "#fff", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "6px", letterSpacing: "0.06em" }}>
            LIVE
          </div>
          {currentStream?.title && (
            <div style={{ color: "#fff", fontSize: "13px", textShadow: "0 1px 4px rgba(0,0,0,0.8)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentStream.title}
            </div>
          )}
        </div>
        <LiveViewerCount />
      </div>

      {/* End / Leave button */}
      <button
        onClick={isHost ? handleEnd : handleLeave}
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 16px) + 4px)",
          right: "16px",
          background: isHost ? "rgba(220,38,38,0.8)" : "rgba(0,0,0,0.5)",
          border: "none",
          color: "#fff",
          borderRadius: "999px",
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          zIndex: 11,
        }}
      >
        {isHost ? "End" : "Leave"}
      </button>

      {/* Top gifters button */}
      <button
        onClick={() => setShowLeaderboard(true)}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 16px) + 48px)", right: "16px", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "999px", padding: "6px 12px", fontSize: "12px", cursor: "pointer", zIndex: 10 }}
      >
        🏆 Gifters
      </button>

      {/* ── Host controls ──────────────────────────────────────────────── */}
      {isHost && joinState === "joined" && (
        <div style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)",
          left: "16px",
          display: "flex",
          gap: "12px",
          zIndex: 10,
        }}>
          <ControlBtn emoji={muted ? "🔇" : "🎙️"} label={muted ? "Unmute" : "Mute"} onClick={toggleMute} />
          <ControlBtn emoji={cameraOff ? "📷" : "📹"} label={cameraOff ? "Cam On" : "Cam Off"} onClick={toggleCamera} />
        </div>
      )}

      {/* ── Audience gift button ────────────────────────────────────────── */}
      {!isHost && joinState === "joined" && (
        <div style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 16px) + 200px)",
          right: "16px",
          zIndex: 10,
        }}>
          <button
            onClick={() => setShowGifts(true)}
            style={{ padding: "10px 18px", borderRadius: "999px", border: "none", background: "rgba(192,132,252,0.25)", color: "#c084fc", fontSize: "13px", fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)" }}
          >
            🎁 Gift
          </button>
        </div>
      )}

      {/* ── Live chat (audience only) ───────────────────────────────────── */}
      {!isHost && <LiveChat onSend={(text) => addChatMessage({ username: "You", text })} canSend />}

      {/* ── Gift animations ─────────────────────────────────────────────── */}
      <LiveGiftAnimation />

      {/* ── Leaderboard sheet ───────────────────────────────────────────── */}
      <LiveGiftersLeaderboard open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      {/* ── Gift picker (audience) ──────────────────────────────────────── */}
      {!isHost && currentStream && (
        <GiftPicker
          open={showGifts}
          onClose={() => setShowGifts(false)}
          recipientId={currentStream.model_id}
          liveStreamId={currentStream.id}
        />
      )}
    </div>
  );
}

function ControlBtn({ emoji, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        background: "rgba(0,0,0,0.5)",
        border: "none",
        borderRadius: "12px",
        padding: "10px 14px",
        color: "#fff",
        cursor: "pointer",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: "22px" }}>{emoji}</span>
      <span style={{ fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</span>
    </button>
  );
}
