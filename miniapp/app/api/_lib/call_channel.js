import crypto from "crypto";

function getCallSecret() {
  return (
    process.env.CALL_CHANNEL_SECRET ||
    process.env.WORKER_CRON_SECRET ||
    process.env.ADMIN_BOT_TOKEN ||
    process.env.USER_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    ""
  );
}

export function getCallChannelName({ sessionId, sessionRef }) {
  const id = Number(sessionId || 0);
  if (!id) {
    return "";
  }
  const secret = getCallSecret();
  if (!secret) {
    return `vr-call-${id}`;
  }
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${id}:${sessionRef || "session"}:v1`)
    .digest("hex")
    .slice(0, 16);
  return `vr-call-${id}-${digest}`;
}
