"""Supabase client — single client instance shared across the app."""

from __future__ import annotations

from supabase import create_client, Client

from app.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return the Supabase client (lazy-loaded, uses secret key for backend)."""
    global _client
    if _client is None:
        _client = create_client(
            settings.supabase_url,
            settings.supabase_secret_key,
        )
    return _client


def get_case_uuid_by_slug(slug: str) -> str | None:
    """Look up the Supabase cases.id (UUID) by the Neo4j matter slug."""
    result = (
        get_supabase()
        .table("cases")
        .select("id")
        .eq("neo4j_matter_id", slug)
        .maybe_single()
        .execute()
    )
    return result.data["id"] if result.data else None


def ping_supabase() -> dict:
    """Verify connectivity to Supabase."""
    try:
        get_supabase().table("cases").select("id").limit(1).execute()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
