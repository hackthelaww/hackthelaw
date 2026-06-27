"""Case events — intelligence timeline for a case."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth_middleware import AuthUser, get_current_user
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/cases/{slug}/events", tags=["case-events"])


@router.get("")
async def list_events(
    slug: str,
    category: str | None = None,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """List all case events, optionally filtered by category."""
    case_uuid = get_case_uuid_by_slug(slug)
    if not case_uuid:
        raise HTTPException(404, f"Case '{slug}' not found")

    sb = get_supabase()
    query = sb.table("case_events").select("*").eq("case_id", case_uuid).order("created_at", desc=True)

    if category:
        query = query.eq("category", category)

    result = query.execute()
    events = result.data or []

    # Compute health metrics
    positive = sum(1 for e in events if e["category"] == "positive")
    routine = sum(1 for e in events if e["category"] == "routine")
    anomalies = sum(1 for e in events if e["category"] == "anomaly")
    unresolved = sum(1 for e in events if e["category"] == "anomaly" and not e.get("resolution"))

    return {
        "events": events,
        "health": {
            "positive": positive,
            "routine": routine,
            "anomalies": anomalies,
            "unresolved_anomalies": unresolved,
            "total": len(events),
        },
    }


class ResolveRequest(BaseModel):
    resolution: str  # "expected" | "typo" | "needs_investigation" | "dismissed"


@router.put("/{event_id}/resolve")
async def resolve_event(
    slug: str,
    event_id: str,
    body: ResolveRequest,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Resolve an anomaly event."""
    if body.resolution not in ("expected", "typo", "needs_investigation", "dismissed"):
        raise HTTPException(422, "resolution must be: expected, typo, needs_investigation, or dismissed")

    sb = get_supabase()
    result = sb.table("case_events").update({
        "resolution": body.resolution,
        "resolved_by": user.id,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", event_id).execute()

    if not result.data:
        raise HTTPException(404, "Event not found")

    return result.data[0]


@router.post("/analyze")
async def trigger_analysis(
    slug: str,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Manually trigger the case intelligence agent."""
    from app.ingest.case_intelligence import run_case_intelligence, store_case_events

    case_uuid = get_case_uuid_by_slug(slug)
    if not case_uuid:
        raise HTTPException(404, f"Case '{slug}' not found")

    events = await run_case_intelligence(
        matter_id=slug,
        new_document_title="Manual analysis",
        new_document_id="__manual__",
    )

    stored = await store_case_events(slug, events)
    return {"events_created": stored, "events": events}
