import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
const TOKEN_TTL_SECONDS = 3 * 60 * 60; // 3 hours

export function generateRtcToken({ channelName, uid, role = "host" }) {
  if (!APP_ID || !APP_CERT) {
    throw new Error("AGORA_APP_ID and AGORA_APP_CERTIFICATE env vars required");
  }

  const agoraRole = role === "host" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const now = Math.floor(Date.now() / 1000);
  const expireTs = now + TOKEN_TTL_SECONDS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channelName,
    uid,           // integer UID (use DB user id)
    agoraRole,
    expireTs,
    expireTs
  );

  return { token, appId: APP_ID, channelName, uid, expiresAt: expireTs };
}
