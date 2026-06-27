"""Cases CRUD — Supabase for ownership/metadata, Neo4j for graph data.

The slug (e.g. "stanford-settlement") is the external identifier used in API
paths and Neo4j Matter nodes. Supabase stores its own UUID PK internally, with
the slug in `neo4j_matter_id`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth_middleware import AuthUser, get_current_user
from app.audit import log_action
from app.db import read_query, write_query
from app.models import CaseCreate, CaseUpdate
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/cases", tags=["cases"])

# Fields that should be synced to Neo4j Matter nodes
_NEO4J_FIELDS = {"name", "description", "client", "jurisdiction", "court", "case_number"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_case_uuid(slug: str) -> str:
    """Return the Supabase UUID for a slug, or raise 404."""
    case_uuid = get_case_uuid_by_slug(slug)
    if not case_uuid:
        raise HTTPException(404, f"Case '{slug}' not found")
    return case_uuid


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_case(body: CaseCreate, user: AuthUser = Depends(get_current_user)) -> dict:
    """Create a case in Supabase + a Matter node in Neo4j."""

    existing = get_case_uuid_by_slug(body.id)
    if existing:
        raise HTTPException(409, f"Case with slug '{body.id}' already exists")

    # 1. Insert into Supabase (all structured fields)
    row = (
        get_supabase()
        .table("cases")
        .insert({
            "name": body.name,
            "description": body.description,
            "client": body.client,
            "case_type": body.case_type,
            "urgency": body.urgency,
            "jurisdiction": body.jurisdiction,
            "judge": body.judge,
            "opposing_counsel": body.opposing_counsel,
            "court": body.court,
            "case_number": body.case_number,
            "practice_area": body.practice_area,
            "owner_id": user.id,
            "neo4j_matter_id": body.id,
        })
        .execute()
    )
    case_data = row.data[0]

    # 2. Add owner as case_member
    get_supabase().table("case_members").insert({
        "case_id": case_data["id"],
        "user_id": user.id,
        "role": "owner",
        "invited_by": user.id,
    }).execute()

    # 3. Create Matter node in Neo4j
    await write_query(
        """
        MERGE (m:Matter {id: $id})
        ON CREATE SET m.name = $name,
                      m.description = $description,
                      m.client = $client,
                      m.jurisdiction = $jurisdiction,
                      m.court = $court,
                      m.case_number = $case_number,
                      m.tags = [],
                      m.created_at = datetime(),
                      m.updated_at = datetime()
        ON MATCH SET  m.name = $name,
                      m.description = $description,
                      m.client = $client,
                      m.jurisdiction = $jurisdiction,
                      m.court = $court,
                      m.case_number = $case_number,
                      m.updated_at = datetime()
        RETURN m {.*} AS matter
        """,
        {
            "id": body.id, "name": body.name, "description": body.description,
            "client": body.client, "jurisdiction": body.jurisdiction,
            "court": body.court, "case_number": body.case_number,
        },
    )

    log_action("case_created", case_id=case_data["id"], user_id=user.id, details={"slug": body.id})
    return {**case_data, "slug": body.id}


@router.get("")
async def list_cases(user: AuthUser = Depends(get_current_user)) -> list[dict]:
    """List cases the user owns or is a member of."""

    owned = (
        get_supabase().table("cases").select("*").eq("owner_id", user.id).execute()
    )
    member_of = (
        get_supabase().table("case_members").select("case_id").eq("user_id", user.id).execute()
    )
    member_case_ids = [r["case_id"] for r in (member_of.data or [])]

    cases_by_id: dict[str, dict] = {}
    for c in (owned.data or []):
        cases_by_id[c["id"]] = c

    if member_case_ids:
        extra = (
            get_supabase().table("cases").select("*").in_("id", member_case_ids).execute()
        )
        for c in (extra.data or []):
            cases_by_id.setdefault(c["id"], c)

    cases = list(cases_by_id.values())

    for case in cases:
        slug = case.get("neo4j_matter_id")
        if not slug:
            continue
        counts = await read_query(
            """
            MATCH (m:Matter {id: $id})
            OPTIONAL MATCH (m)-[:HAS_PARTY]->(p:Party)
            OPTIONAL MATCH (d:Document)-[:BELONGS_TO]->(m)
            OPTIONAL MATCH (dl:Deadline)-[:BELONGS_TO]->(m)
            RETURN count(DISTINCT p) AS party_count,
                   count(DISTINCT d) AS doc_count,
                   count(DISTINCT dl) AS deadline_count
            """,
            {"id": slug},
        )
        if counts:
            case["party_count"] = counts[0]["party_count"]
            case["doc_count"] = counts[0]["doc_count"]
            case["deadline_count"] = counts[0]["deadline_count"]

    return cases


@router.get("/{slug}")
async def get_case(slug: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Get a single case by slug, with Neo4j detail."""
    case_uuid = _require_case_uuid(slug)
    _check_case_access(case_uuid, user.id)

    result = get_supabase().table("cases").select("*").eq("id", case_uuid).single().execute()
    case_data = result.data

    parties = await read_query(
        "MATCH (:Matter {id: $id})-[:HAS_PARTY]->(p:Party) RETURN p {.*} AS party",
        {"id": slug},
    )
    documents = await read_query(
        "MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $id}) RETURN d {.*} AS document",
        {"id": slug},
    )
    deadlines = await read_query(
        "MATCH (dl:Deadline)-[:BELONGS_TO]->(:Matter {id: $id}) RETURN dl {.*} AS deadline ORDER BY dl.due_at",
        {"id": slug},
    )
    sb_docs = (
        get_supabase().table("case_documents").select("*").eq("case_id", case_uuid).execute()
    )

    return {
        "case": case_data,
        "parties": [r["party"] for r in parties],
        "documents": [r["document"] for r in documents],
        "deadlines": [r["deadline"] for r in deadlines],
        "case_documents": sb_docs.data or [],
    }


@router.put("/{slug}")
async def update_case(slug: str, body: CaseUpdate, user: AuthUser = Depends(get_current_user)) -> dict:
    """Update case metadata in both Supabase and Neo4j."""
    case_uuid = _require_case_uuid(slug)
    _check_case_owner(case_uuid, user.id)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(422, "No fields to update")

    result = get_supabase().table("cases").update(updates).eq("id", case_uuid).execute()

    neo4j_updates = {k: v for k, v in updates.items() if k in _NEO4J_FIELDS}
    if neo4j_updates:
        set_clauses = ", ".join(f"m.{k} = ${k}" for k in neo4j_updates)
        await write_query(
            f"MATCH (m:Matter {{id: $id}}) SET {set_clauses}, m.updated_at = datetime() RETURN m {{.*}} AS matter",
            {"id": slug, **neo4j_updates},
        )

    log_action("case_updated", case_id=case_uuid, user_id=user.id, details=updates)
    return result.data[0] if result.data else {}


@router.delete("/{slug}", status_code=204)
async def delete_case(slug: str, user: AuthUser = Depends(get_current_user)):
    """Delete a case from both Supabase (cascades) and Neo4j."""
    case_uuid = _require_case_uuid(slug)
    _check_case_owner(case_uuid, user.id)

    get_supabase().table("cases").delete().eq("id", case_uuid).execute()
    await write_query("MATCH (m:Matter {id: $id}) DETACH DELETE m", {"id": slug})
    log_action("case_deleted", case_id=case_uuid, user_id=user.id, details={"slug": slug})


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------

@router.put("/{slug}/deadlines")
async def update_deadlines(slug: str, deadlines: list[dict], user: AuthUser = Depends(get_current_user)) -> dict:
    """Replace the deadlines array for a case."""
    case_uuid = _require_case_uuid(slug)
    _check_case_access(case_uuid, user.id)

    import json
    result = get_supabase().table("cases").update(
        {"deadlines": json.loads(json.dumps(deadlines, default=str))}
    ).eq("id", case_uuid).execute()

    log_action("deadlines_updated", case_id=case_uuid, user_id=user.id)
    return result.data[0] if result.data else {}


# ---------------------------------------------------------------------------
# AI Summary
# ---------------------------------------------------------------------------

@router.get("/{slug}/summary")
async def get_summary(slug: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Get the AI-generated case summary + live entity counts."""
    case_uuid = _require_case_uuid(slug)
    _check_case_access(case_uuid, user.id)

    result = get_supabase().table("cases").select("ai_summary").eq("id", case_uuid).single().execute()
    summary = result.data.get("ai_summary") if result.data else None

    entity_counts = await read_query(
        """
        MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $id})
        RETURN labels(e) AS labels, count(e) AS count
        """,
        {"id": slug},
    )

    return {
        "summary": summary,
        "entity_counts": {str(r["labels"]): r["count"] for r in entity_counts},
    }


@router.post("/{slug}/summary")
async def regenerate_summary(slug: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Regenerate the AI summary from all entities in the graph."""
    case_uuid = _require_case_uuid(slug)
    _check_case_access(case_uuid, user.id)

    from app.ingest.summary_agent import generate_case_summary
    from app.config import settings

    summary = await generate_case_summary(
        matter_id=slug,
        api_key=settings.anthropic_api_key,
    )

    from datetime import datetime, timezone
    summary["generated_at"] = datetime.now(timezone.utc).isoformat()

    doc_count = await read_query(
        "MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid}) RETURN count(d) AS c",
        {"mid": slug},
    )
    summary["doc_count"] = doc_count[0]["c"] if doc_count else 0

    get_supabase().table("cases").update({"ai_summary": summary}).eq("id", case_uuid).execute()
    log_action("summary_regenerated", case_id=case_uuid, user_id=user.id)

    return summary


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/{slug}/audit")
async def get_audit_log(slug: str, user: AuthUser = Depends(get_current_user)) -> list[dict]:
    """Get the audit trail for a case."""
    case_uuid = _require_case_uuid(slug)
    _check_case_access(case_uuid, user.id)

    result = (
        get_supabase()
        .table("audit_log")
        .select("*")
        .eq("case_id", case_uuid)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# Access control helpers
# ---------------------------------------------------------------------------

def _check_case_access(case_uuid: str, user_id: str) -> None:
    case = get_supabase().table("cases").select("owner_id").eq("id", case_uuid).single().execute()
    if case.data and case.data["owner_id"] == user_id:
        return
    member = (
        get_supabase().table("case_members").select("id")
        .eq("case_id", case_uuid).eq("user_id", user_id).maybe_single().execute()
    )
    if not member.data:
        raise HTTPException(403, "You don't have access to this case")


def _check_case_owner(case_uuid: str, user_id: str) -> None:
    case = get_supabase().table("cases").select("owner_id").eq("id", case_uuid).single().execute()
    if not case.data or case.data["owner_id"] != user_id:
        raise HTTPException(403, "Only the case owner can perform this action")
