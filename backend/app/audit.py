"""Audit log helper — append-only action trail in Supabase."""

from __future__ import annotations

from app.supabase_client import get_supabase


def log_action(
    action: str,
    case_id: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Insert an audit log entry. Fire-and-forget (errors are swallowed)."""
    try:
        get_supabase().table("audit_log").insert({
            "case_id": case_id,
            "user_id": user_id,
            "action": action,
            "details": details or {},
        }).execute()
    except Exception:
        # Audit logging should never break the main flow
        pass
