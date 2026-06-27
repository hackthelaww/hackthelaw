"""Supabase Auth — JWT validation for FastAPI."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request


from app.config import settings


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

    Usage:
        @router.post("/something")
        async def endpoint(user: AuthUser = Depends(get_current_user)):
            ...
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(401, "Missing Authorization header")

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid token: {e}")

    user_id = payload.get("sub")
    email = payload.get("email", "")
    if not user_id:
        raise HTTPException(401, "Token missing sub claim")

    return AuthUser(id=user_id, email=email)


async def optional_user(request: Request) -> AuthUser | None:
    """FastAPI dependency — returns None if no token is present."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
