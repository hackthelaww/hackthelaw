"""Cases CRUD — Supabase for ownership/metadata, Neo4j for graph data.

The slug (e.g. "stanford-settlement") is the external identifier used in API
paths and Neo4j Matter nodes. Supabase stores its own UUID PK internally, with
the slug in `neo4j_matter_id`.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import AuthUser, get_current_user
from app.audit import log_action
from app.db import read_query, write_query
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/cases", tags=["cases"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CaseCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=128, description="Slug, e.g. 'stanford-settlement'")
    name: str = Field(..., min_length=1)
    description: str = ""
    client: str | None = None
    case_type: str = ""


class CaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    client: str | None = None
    case_type: str | None = None
    status: str | None = None


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

    # Check slug isn't taken
    existing = get_case_uuid_by_slug(body.id)
    if existing:
        raise HTTPException(409, f"Case with slug '{body.id}' already exists")

    # 1. Insert into Supabase
    row = (
        get_supabase()
        .table("cases")
        .insert({
            "name": body.name,
            "description": body.description,
            "client": body.client,
            "case_type": body.case_type,
            "owner_id": user.id,
            "neo4j_matter_id": body.id,
        })
        .execute()
    )
    case_data = row.data[0]

    # 2. Add owner as a case_member
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
                      m.tags = [],
                      m.created_at = datetime(),
                      m.updated_at = datetime()
        ON MATCH SET  m.name = $name,
                      m.description = $description,
                      m.client = $client,
                      m.updated_at = datetime()
        RETURN m {.*} AS matter
        """,
        {"id": body.id, "name": body.name, "description": body.description, "client": body.client},
    )

    # 4. Audit
    log_action("case_created", case_id=case_data["id"], user_id=user.id, details={"slug": body.id})

    return {**case_data, "slug": body.id}


@router.get("")
async def list_cases(user: AuthUser = Depends(get_current_user)) -> list[dict]:
    """List cases the user owns or is a member of."""

    # Get case UUIDs the user can access
    owned = (
        get_supabase()
        .table("cases")
        .select("*")
        .eq("owner_id", user.id)
        .execute()
    )
    member_of = (
        get_supabase()
        .table("case_members")
        .select("case_id")
        .eq("user_id", user.id)
        .execute()
    )
    member_case_ids = [r["case_id"] for r in (member_of.data or [])]

    # Merge owned + member-of cases
    cases_by_id: dict[str, dict] = {}
    for c in (owned.data or []):
        cases_by_id[c["id"]] = c

    if member_case_ids:
        extra = (
            get_supabase()
            .table("cases")
            .select("*")
            .in_("id", member_case_ids)
            .execute()
        )
        for c in (extra.data or []):
            cases_by_id.setdefault(c["id"], c)

    cases = list(cases_by_id.values())

    # Enrich with Neo4j counts for each case
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

    # Verify access
    _check_case_access(case_uuid, user.id)

    # Supabase case data
    result = get_supabase().table("cases").select("*").eq("id", case_uuid).single().execute()
    case_data = result.data

    # Neo4j detail (parties, documents, deadlines)
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

    # Supabase document metadata
    sb_docs = (
        get_supabase()
        .table("case_documents")
        .select("*")
        .eq("case_id", case_uuid)
        .execute()
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

    # Build update payload (only non-None fields)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(422, "No fields to update")

    # Supabase update
    result = get_supabase().table("cases").update(updates).eq("id", case_uuid).execute()

    # Neo4j update (only name, description, client)
    neo4j_updates = {k: v for k, v in updates.items() if k in ("name", "description", "client")}
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

    # Supabase delete (cascades to case_members, case_documents)
    get_supabase().table("cases").delete().eq("id", case_uuid).execute()

    # Neo4j delete
    await write_query(
        "MATCH (m:Matter {id: $id}) DETACH DELETE m",
        {"id": slug},
    )

    log_action("case_deleted", case_id=case_uuid, user_id=user.id, details={"slug": slug})


# ---------------------------------------------------------------------------
# Audit log for a case
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
    """Raise 403 if the user can't access this case."""
    case = get_supabase().table("cases").select("owner_id").eq("id", case_uuid).single().execute()
    if case.data and case.data["owner_id"] == user_id:
        return

    member = (
        get_supabase()
        .table("case_members")
        .select("id")
        .eq("case_id", case_uuid)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not member.data:
        raise HTTPException(403, "You don't have access to this case")


def _check_case_owner(case_uuid: str, user_id: str) -> None:
    """Raise 403 if the user isn't the case owner."""
    case = get_supabase().table("cases").select("owner_id").eq("id", case_uuid).single().execute()
    if not case.data or case.data["owner_id"] != user_id:
        raise HTTPException(403, "Only the case owner can perform this action")
