import { NextResponse } from "next/server";
import { verifyInitData } from "../../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

export async function POST(request) {
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: "turn_not_configured" }, { status: 500 });
  }

  try {
    const token = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
      "base64"
    );
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: "turn_token_failed", detail: data?.message || "Unable to fetch TURN" },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, iceServers: data?.ice_servers || [] });
  } catch (error) {
    return NextResponse.json(
      { error: "turn_token_failed", detail: error?.message || "Unable to fetch TURN" },
      { status: 502 }
    );
  }
}
