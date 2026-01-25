import hashlib
import hmac
from pathlib import Path
import sys
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request

ROOT = Path(__file__).resolve().parent
sys.path.append(str(ROOT))

from shared.config import settings
from shared.db import AsyncSessionLocal
from shared.notifications import send_escrow_log
from shared.payment_processor import process_transaction

app = FastAPI()


def _verify_paystack_signature(payload: bytes, signature: Optional[str]) -> bool:
    if not settings.paystack_secret_key:
        return False
    if not signature:
        return False
    digest = hmac.new(
        settings.paystack_secret_key.encode("utf-8"),
        payload,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)


def _verify_flutterwave_signature(signature: Optional[str]) -> bool:
    if not settings.flutterwave_webhook_hash:
        return False
    if not signature:
        return False
    return hmac.compare_digest(settings.flutterwave_webhook_hash, signature)


def _extract_reference(payload: dict[str, Any]) -> Optional[str]:
    data = payload.get("data") or {}
    return (
        data.get("reference")
        or data.get("tx_ref")
        or payload.get("reference")
        or payload.get("tx_ref")
    )


@app.post("/webhooks/paystack")
async def paystack_webhook(request: Request):
    if not settings.paystack_secret_key:
        raise HTTPException(status_code=503, detail="Paystack secret not configured")
    raw_body = await request.body()
    signature = request.headers.get("X-Paystack-Signature")
    if not _verify_paystack_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid Paystack signature")

    payload = await request.json()
    transaction_ref = _extract_reference(payload)
    if not transaction_ref:
        raise HTTPException(status_code=400, detail="Missing transaction reference")

    async with AsyncSessionLocal() as db:
        escrow = await process_transaction(
            db,
            transaction_ref=transaction_ref,
            provider="paystack",
            payload=payload,
        )
        if escrow:
            await send_escrow_log(
                f"Escrow created: {escrow.escrow_ref} ({escrow.escrow_type}) amount {escrow.amount}"
            )

    return {"status": "ok"}


@app.post("/webhooks/flutterwave")
async def flutterwave_webhook(request: Request):
    if not settings.flutterwave_webhook_hash:
        raise HTTPException(status_code=503, detail="Flutterwave webhook hash not configured")
    signature = request.headers.get("verif-hash")
    if not _verify_flutterwave_signature(signature):
        raise HTTPException(status_code=401, detail="Invalid Flutterwave signature")

    payload = await request.json()
    transaction_ref = _extract_reference(payload)
    if not transaction_ref:
        raise HTTPException(status_code=400, detail="Missing transaction reference")

    async with AsyncSessionLocal() as db:
        escrow = await process_transaction(
            db,
            transaction_ref=transaction_ref,
            provider="flutterwave",
            payload=payload,
        )
        if escrow:
            await send_escrow_log(
                f"Escrow created: {escrow.escrow_ref} ({escrow.escrow_type}) amount {escrow.amount}"
            )

    return {"status": "ok"}
