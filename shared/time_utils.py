from datetime import datetime, timezone


def utcnow() -> datetime:
    # Keep naive UTC datetimes for compatibility with existing schema defaults.
    return datetime.now(timezone.utc).replace(tzinfo=None)
