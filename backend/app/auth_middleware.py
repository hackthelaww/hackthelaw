"""Supabase Auth — JWT validation for FastAPI.

Uses the Supabase client (service role) to verify tokens, which handles
the new key format (EdDSA/ES256) automatically.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.supabase_client import get_supabase


@dataclass
class AuthUser:
    id: str       # Supabase auth.users UUID
    email: str


def _extract_token(request: Request) -> str | None:
    """Pull the Bearer token from the Authorization header."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request) -> AuthUser:
    """FastAPI dependency — requires a valid Supabase JWT.

    Uses the Supabase admin client to verify the token, which works
    with both legacy (HS256) and new (EdDSA) key formats.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(401, "Missing Authorization header")

    try:
        user_response = get_supabase().auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(401, "Invalid token")
        return AuthUser(id=str(user.id), email=user.email or "")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}")


async def optional_user(request: Request) -> AuthUser | None:
    """FastAPI dependency — returns None if no token is present."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
