"""User management routes — admin operations via Supabase Auth."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.supabase_client import get_supabase

router = APIRouter(prefix="/api/users", tags=["users"])


@router.delete("")
async def delete_all_users() -> dict:
    """Delete ALL users from Supabase Auth.

    WARNING: Destructive. Dev/hackathon use only.
    Cascades to remove case_members rows via FK constraints.
    """
    try:
        response = get_supabase().auth.admin.list_users()
        # response can be a list directly or have a .users attribute
        users = response if isinstance(response, list) else getattr(response, "users", response)
    except Exception as e:
        raise HTTPException(500, f"Failed to list users: {e}")

    results = []
    for user in users:
        user_id = user.id if hasattr(user, "id") else user["id"]
        email = user.email if hasattr(user, "email") else user.get("email")
        try:
            get_supabase().auth.admin.delete_user(user_id)
            results.append({"id": user_id, "email": email, "deleted": True})
        except Exception as e:
            results.append({"id": user_id, "email": email, "deleted": False, "error": str(e)})

    deleted = sum(1 for r in results if r["deleted"])
    return {
        "total": len(users),
        "deleted": deleted,
        "failed": len(users) - deleted,
        "results": results,
    }


@router.delete("/{user_id}")
async def delete_user(user_id: str) -> dict:
    """Delete a single user by ID."""
    try:
        get_supabase().auth.admin.delete_user(user_id)
        return {"id": user_id, "deleted": True}
    except Exception as e:
        raise HTTPException(500, f"Failed to delete user: {e}")
