"""DB helpers — psycopg3 (psycopg[binary]) with psycopg2 fallback."""
import os
import json

try:
    import psycopg  # psycopg3
    _driver = "psycopg3"
except ImportError:
    import psycopg2 as psycopg  # type: ignore
    _driver = "psycopg2"


def get_raw_connection():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    # psycopg3 needs `postgresql://` -> `postgresql+psycopg://` stripped handled by caller,
    # but psycopg.connect accepts both; strip dialect prefix
    if url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql://", 1)
    conn = psycopg.connect(url)
    # psycopg3 autocommit off by default, same as psycopg2
    if hasattr(conn, "autocommit"):
        try:
            conn.autocommit = False
        except Exception:
            pass
    return conn


def auto_claim_documents(session_id: str, user_id: str) -> int:
    """Claim anonymous vectors (session_id only) to user_id. Returns count."""
    if not session_id or not user_id:
        return 0
    try:
        conn = get_raw_connection()
    except Exception as e:
        print(f"[db] auto_claim_documents skip (no DB): {e}")
        return 0
    try:
        cur = conn.cursor()
        # cmetadata is JSONB; claim where session_id matches and user_id is null/empty
        cur.execute(
            """
            UPDATE langchain_pg_embedding
            SET cmetadata = cmetadata || %s::jsonb
            WHERE cmetadata->>'session_id' = %s
              AND (cmetadata->>'user_id' IS NULL OR cmetadata->>'user_id' = '')
            """,
            (json.dumps({"user_id": user_id}), session_id),
        )
        n = cur.rowcount
        conn.commit()
        cur.close()
        return n
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        print(f"[db] auto_claim_documents error: {e}")
        return 0
    finally:
        try:
            conn.close()
        except Exception:
            pass


def auto_claim_chat_sessions(session_id: str, user_id: str) -> int:
    """Claim chat_history.json sessions. No-op on Render if file absent (ephemeral)."""
    if not session_id or not user_id:
        return 0
    path = "./chat_history.json"
    if not os.path.exists(path):
        return 0
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return 0
        claimed = 0
        for s in data:
            if s.get("session_id") == session_id and not s.get("user_id"):
                s["user_id"] = user_id
                # keep session_id for trace
                claimed += 1
        if claimed:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str, ensure_ascii=False)
        return claimed
    except Exception as e:
        print(f"[db] auto_claim_chat_sessions error: {e}")
        return 0
