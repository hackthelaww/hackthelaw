"""Team member management — who can access a case."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import AuthUser, get_current_user
from app.audit import log_action
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/cases/{slug}/members", tags=["members"])


class MemberAdd(BaseModel):
    email: str
    role: str = "viewer"  # "editor" or "viewer"


class MemberUpdate(BaseModel):
    role: str  # "editor" or "viewer"


def _require_case_uuid(slug: str) -> str:
    case_uuid = get_case_uuid_by_slug(slug)
    if not case_uuid:
        raise HTTPException(404, f"Case '{slug}' not found")
    return case_uuid


def _check_owner(case_uuid: str, user_id: str) -> None:
    case = get_supabase().table("cases").select("owner_id").eq("id", case_uuid).single().execute()
    if not case.data or case.data["owner_id"] != user_id:
        raise HTTPException(403, "Only the case owner can manage members")


@router.get("")
async def list_members(slug: str, user: AuthUser = Depends(get_current_user)) -> list[dict]:
    """List all members of a case."""
    case_uuid = _require_case_uuid(slug)

    result = (
        get_supabase()
        .table("case_members")
        .select("id, user_id, role, created_at")
        .eq("case_id", case_uuid)
        .execute()
    )
    return result.data or []


@router.post("", status_code=201)
async def add_member(slug: str, body: MemberAdd, user: AuthUser = Depends(get_current_user)) -> dict:
    """Add a member to a case by email. Only the case owner can do this."""
    case_uuid = _require_case_uuid(slug)
    _check_owner(case_uuid, user.id)

    if body.role not in ("editor", "viewer"):
        raise HTTPException(422, "Role must be 'editor' or 'viewer'")

    # Look up user by email in Supabase Auth
    try:
        users_response = get_supabase().auth.admin.list_users()
        target_user = None
        for u in users_response:
            if hasattr(u, 'email') and u.email == body.email:
                target_user = u
                break
        if not target_user:
            raise HTTPException(404, f"No user found with email '{body.email}'")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to look up user: {e}")

    # Check not already a member
    existing = (
        get_supabase()
        .table("case_members")
        .select("id")
        .eq("case_id", case_uuid)
        .eq("user_id", target_user.id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(409, "User is already a member of this case")

    result = (
        get_supabase()
        .table("case_members")
        .insert({
            "case_id": case_uuid,
            "user_id": target_user.id,
            "role": body.role,
            "invited_by": user.id,
        })
        .execute()
    )

    log_action(
        "member_added",
        case_id=case_uuid,
        user_id=user.id,
        details={"added_user": target_user.id, "email": body.email, "role": body.role},
    )

    return result.data[0]


@router.put("/{member_user_id}")
async def update_member_role(
    slug: str, member_user_id: str, body: MemberUpdate, user: AuthUser = Depends(get_current_user)
) -> dict:
    """Change a member's role."""
    case_uuid = _require_case_uuid(slug)
    _check_owner(case_uuid, user.id)

    if body.role not in ("editor", "viewer"):
        raise HTTPException(422, "Role must be 'editor' or 'viewer'")

    result = (
        get_supabase()
        .table("case_members")
        .update({"role": body.role})
        .eq("case_id", case_uuid)
        .eq("user_id", member_user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Member not found")

    log_action(
        "member_role_changed",
        case_id=case_uuid,
        user_id=user.id,
        details={"target_user": member_user_id, "new_role": body.role},
    )

    return result.data[0]


@router.delete("/{member_user_id}", status_code=204)
async def remove_member(slug: str, member_user_id: str, user: AuthUser = Depends(get_current_user)):
    """Remove a member from a case."""
    case_uuid = _require_case_uuid(slug)
    _check_owner(case_uuid, user.id)

    if member_user_id == user.id:
        raise HTTPException(422, "Cannot remove yourself — transfer ownership first")

    get_supabase().table("case_members").delete().eq("case_id", case_uuid).eq("user_id", member_user_id).execute()

    log_action(
        "member_removed",
        case_id=case_uuid,
        user_id=user.id,
        details={"removed_user": member_user_id},
    )
