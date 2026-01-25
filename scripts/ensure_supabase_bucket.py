from pathlib import Path
import sys

from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from config import settings  # noqa: E402


def main():
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")

    supabase_url = settings.supabase_url
    if not supabase_url.endswith("/"):
        supabase_url += "/"

    client = create_client(supabase_url, settings.supabase_service_key)
    buckets = client.storage.list_buckets()
    bucket_names = {bucket.name for bucket in buckets}

    for bucket in (settings.supabase_bucket, settings.supabase_verification_bucket):
        if bucket in bucket_names:
            print(f"Bucket exists: {bucket}")
            continue
        is_public = bucket == settings.supabase_bucket
        client.storage.create_bucket(bucket, options={"public": is_public})
        print(f"Created bucket: {bucket}")


if __name__ == "__main__":
    main()
