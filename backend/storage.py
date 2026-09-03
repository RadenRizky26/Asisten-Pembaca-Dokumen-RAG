"""
Supabase Storage helper - no new deps (httpx already in requirements).
Fallback to local filesystem when SUPABASE env not set (local dev).
"""
import os
import httpx

def _cfg():
    return (
        os.getenv("SUPABASE_URL", "").rstrip("/"),
        os.getenv("SUPABASE_SERVICE_KEY", ""),
        os.getenv("SUPABASE_BUCKET_ASLI", "dokumen-asli"),
        os.getenv("SUPABASE_BUCKET_HASIL", "dokumen-hasil"),
    )

def is_enabled() -> bool:
    url, key, _, _ = _cfg()
    return bool(url and key)

def _headers(content_type: str | None = None):
    _, key, _, _ = _cfg()
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    if content_type:
        h["Content-Type"] = content_type
    return h

def upload_bytes(bucket: str, path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if not is_enabled():
        return
    url, _, _, _ = _cfg()
    full = f"{url}/storage/v1/object/{bucket}/{path}"
    headers = _headers(content_type)
    headers["x-upsert"] = "true"
    with httpx.Client(timeout=60) as client:
        r = client.post(full, content=data, headers=headers)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Supabase upload failed {r.status_code}: {r.text[:500]}")

def download_bytes(bucket: str, path: str) -> bytes:
    url, _, _, _ = _cfg()
    full = f"{url}/storage/v1/object/{bucket}/{path}"
    with httpx.Client(timeout=60) as client:
        r = client.get(full, headers=_headers())
    if r.status_code != 200:
        raise FileNotFoundError(f"Supabase {bucket}/{path} -> {r.status_code}: {r.text[:300]}")
    return r.content

def delete_objects(bucket: str, paths: list[str]) -> None:
    if not paths:
        return
    if not is_enabled():
        return
    url, _, _, _ = _cfg()
    full = f"{url}/storage/v1/object/{bucket}"
    with httpx.Client(timeout=30) as client:
        r = client.request("DELETE", full, json={"prefixes": paths}, headers=_headers("application/json"))
    if r.status_code not in (200, 204, 404):
        raise RuntimeError(f"Supabase delete {r.status_code}: {r.text[:500]}")

def list_objects(bucket: str, prefix: str = "") -> list[str]:
    if not is_enabled():
        return []
    url, _, _, _ = _cfg()
    full = f"{url}/storage/v1/object/list/{bucket}"
    payload = {"prefix": prefix, "limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}}
    with httpx.Client(timeout=30) as client:
        r = client.post(full, json=payload, headers=_headers("application/json"))
    if r.status_code != 200:
        if r.status_code == 400 and "Bucket not found" in r.text:
            return []
        raise RuntimeError(f"Supabase list {r.status_code}: {r.text[:500]}")
    items = r.json() or []
    return [it["name"] for it in items if it.get("name") and not it["name"].endswith("/")]
