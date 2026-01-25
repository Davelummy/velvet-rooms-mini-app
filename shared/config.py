import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")


def _get_int(value: Optional[str]) -> Optional[int]:
    if value is None or value == "":
        return None
    return int(value)


def _get_int_list(value: Optional[str]) -> List[int]:
    if not value:
        return []
    return [int(part.strip()) for part in value.split(",") if part.strip()]


def _get_int_with_default(value: Optional[str], default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def _get_str(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    return value


def _get_url_with_slash(value: Optional[str]) -> Optional[str]:
    url = _get_str(value)
    if not url:
        return None
    return url if url.endswith("/") else f"{url}/"


def _get_str_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _get_kv_map(value: Optional[str]) -> Dict[str, str]:
    if not value:
        return {}
    entries: List[str] = []
    for chunk in value.replace(",", ";").split(";"):
        if chunk.strip():
            entries.append(chunk.strip())
    mapping: Dict[str, str] = {}
    for entry in entries:
        if "=" not in entry:
            continue
        key, val = entry.split("=", 1)
        key = key.strip()
        val = val.strip()
        if key and val:
            mapping[key] = val
    return mapping


def _get_crypto_wallet_addresses() -> Dict[str, str]:
    return _get_kv_map(os.getenv("CRYPTO_WALLET_ADDRESSES"))


def _get_crypto_networks() -> List[str]:
    return _get_str_list(os.getenv("CRYPTO_NETWORKS")) or [
        "TRC20",
        "ERC20",
        "BEP20",
        "BTC",
        "SOL",
        "POLYGON",
        "TON",
        "AVAX",
        "ARBITRUM",
        "OPTIMISM",
    ]


def _get_crypto_currencies() -> List[str]:
    return _get_str_list(os.getenv("CRYPTO_CURRENCIES")) or [
        "USDT",
        "USDC",
        "BTC",
        "ETH",
        "BNB",
        "SOL",
        "TRX",
        "TON",
    ]


@dataclass(frozen=True)
class Settings:
    # Bot tokens
    user_bot_token: Optional[str] = _get_str(os.getenv("USER_BOT_TOKEN")) or _get_str(
        os.getenv("BOT_TOKEN")
    )
    admin_bot_token: Optional[str] = _get_str(os.getenv("ADMIN_BOT_TOKEN"))
    user_bot_username: Optional[str] = _get_str(os.getenv("USER_BOT_USERNAME")) or _get_str(
        os.getenv("BOT_USERNAME")
    )
    webapp_url: Optional[str] = _get_str(os.getenv("WEBAPP_URL"))

    # Database & cache
    database_url: Optional[str] = _get_str(os.getenv("DATABASE_URL"))
    redis_url: Optional[str] = _get_str(os.getenv("REDIS_URL"))

    # Webhook base URLs (public)
    user_bot_webhook_base_url: Optional[str] = _get_str(
        os.getenv("USER_BOT_WEBHOOK_URL")
    ) or _get_str(os.getenv("WEBHOOK_BASE_URL"))
    admin_bot_webhook_base_url: Optional[str] = _get_str(
        os.getenv("ADMIN_BOT_WEBHOOK_URL")
    ) or _get_str(os.getenv("ADMIN_BOT_WEBHOOK_BASE_URL"))

    # Webhook bind hosts/ports (local)
    user_bot_host: str = os.getenv("USER_BOT_HOST", os.getenv("WEBHOOK_HOST", "0.0.0.0"))
    user_bot_port: int = _get_int_with_default(
        os.getenv("USER_BOT_PORT"), _get_int_with_default(os.getenv("WEBHOOK_PORT"), 8080)
    )
    admin_bot_host: str = os.getenv("ADMIN_BOT_HOST", user_bot_host)
    admin_bot_port: int = _get_int_with_default(
        os.getenv("ADMIN_BOT_PORT"), user_bot_port + 1
    )

    # Admins & channels
    admin_telegram_ids: Tuple[int, ...] = tuple(_get_int_list(os.getenv("ADMIN_TELEGRAM_IDS")))
    main_gallery_channel_id: Optional[int] = _get_int(os.getenv("MAIN_GALLERY_CHANNEL_ID"))
    model_dashboard_channel_id: Optional[int] = _get_int(os.getenv("MODEL_DASHBOARD_CHANNEL_ID"))
    escrow_log_channel_id: Optional[int] = _get_int(os.getenv("ESCROW_LOG_CHANNEL_ID"))

    # Payments
    paystack_secret_key: Optional[str] = _get_str(os.getenv("PAYSTACK_SECRET_KEY"))
    paystack_public_key: Optional[str] = _get_str(os.getenv("PAYSTACK_PUBLIC_KEY"))
    flutterwave_secret_key: Optional[str] = _get_str(os.getenv("FLUTTERWAVE_SECRET_KEY"))
    flutterwave_public_key: Optional[str] = _get_str(os.getenv("FLUTTERWAVE_PUBLIC_KEY"))
    flutterwave_webhook_hash: Optional[str] = _get_str(os.getenv("FLUTTERWAVE_WEBHOOK_HASH"))
    # Crypto payments (manual approval)
    crypto_wallet_address: Optional[str] = _get_str(os.getenv("CRYPTO_WALLET_ADDRESS"))
    crypto_network: Optional[str] = _get_str(os.getenv("CRYPTO_NETWORK"))
    crypto_currency: Optional[str] = _get_str(os.getenv("CRYPTO_CURRENCY"))
    crypto_wallet_addresses: Dict[str, str] = field(default_factory=_get_crypto_wallet_addresses)
    crypto_networks: List[str] = field(default_factory=_get_crypto_networks)
    crypto_currencies: List[str] = field(default_factory=_get_crypto_currencies)

    # Monitoring
    sentry_dsn: Optional[str] = _get_str(os.getenv("SENTRY_DSN"))

    # Supabase storage
    supabase_url: Optional[str] = _get_url_with_slash(os.getenv("SUPABASE_URL"))
    supabase_service_key: Optional[str] = _get_str(os.getenv("SUPABASE_SERVICE_KEY"))
    supabase_bucket: str = os.getenv("SUPABASE_BUCKET", "velvetroomsbot")
    supabase_verification_bucket: str = os.getenv("SUPABASE_VERIFICATION_BUCKET", "velvetrooms-verification")

    # Escrow policy
    manual_release_only: bool = os.getenv("MANUAL_RELEASE_ONLY", "true").lower() == "true"

    # Security
    secret_key: Optional[str] = _get_str(os.getenv("SECRET_KEY"))
    encryption_key: Optional[str] = _get_str(os.getenv("ENCRYPTION_KEY"))


settings = Settings()
