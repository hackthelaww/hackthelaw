"""Wipe routes — nuke Neo4j and/or Supabase data independently.

WARNING: Destructive. Dev/hackathon use only.

DELETE /api/wipe/neo4j     — delete all nodes and relationships in Neo4j
DELETE /api/wipe/supabase  — delete all rows from cases, case_members, case_documents, audit_log
DELETE /api/wipe/all       — wipe both
"""

from __future__ import annotations

from fastapi import APIRouter

from app.db import write_query
from app.supabase_client import get_supabase

router = APIRouter(prefix="/api/wipe", tags=["wipe"])


async def _wipe_neo4j() -> dict:
    """Delete all nodes and relationships in Neo4j."""
    # DETACH DELETE in batches to avoid memory issues on large graphs
    total = 0
    while True:
        result = await write_query(
            "MATCH (n) WITH n LIMIT 5000 DETACH DELETE n RETURN count(*) AS deleted"
        )
        deleted = result[0]["deleted"] if result else 0
        total += deleted
        if deleted == 0:
            break
    return {"nodes_deleted": total}


def _wipe_supabase() -> dict:
    """Delete all rows from Supabase operational tables."""
    sb = get_supabase()
    counts = {}

    # Order matters: children first (FK constraints)
    for table in ["audit_log", "case_documents", "case_members", "cases"]:
        try:
            # Delete all rows (neq filter on id that's always true)
            result = sb.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            counts[table] = len(result.data) if result.data else 0
        except Exception as e:
            counts[table] = f"error: {e}"

    return counts


@router.delete("/neo4j")
async def wipe_neo4j() -> dict:
    """Wipe all data from Neo4j."""
    result = await _wipe_neo4j()
    return {"wiped": "neo4j", **result}


@router.delete("/supabase")
async def wipe_supabase() -> dict:
    """Wipe all operational data from Supabase (cases, members, documents, audit log)."""
    result = _wipe_supabase()
    return {"wiped": "supabase", "tables": result}


@router.delete("/all")
async def wipe_all() -> dict:
    """Wipe both Neo4j and Supabase."""
    neo4j_result = await _wipe_neo4j()
    supabase_result = _wipe_supabase()
    return {
        "wiped": "all",
        "neo4j": neo4j_result,
        "supabase": supabase_result,
    }


@router.delete("/hard-reset")
async def hard_reset() -> dict:
    """Nuclear option — wipe Neo4j, Supabase tables, Storage bucket, and all auth users."""
    sb = get_supabase()

    # 1. Neo4j
    neo4j_result = await _wipe_neo4j()

    # 2. Supabase tables
    supabase_result = _wipe_supabase()

    # 3. Summary history
    try:
        sb.table("case_summary_history").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception:
        pass

    # 4. Storage bucket — delete all files
    storage_deleted = 0
    try:
        files = sb.storage.from_("case-documents").list()
        for folder in (files or []):
            folder_name = folder.get("name", "")
            if not folder_name:
                continue
            inner = sb.storage.from_("case-documents").list(folder_name)
            for f in (inner or []):
                path = f"{folder_name}/{f.get('name', '')}"
                try:
                    sb.storage.from_("case-documents").remove([path])
                    storage_deleted += 1
                except Exception:
                    pass
    except Exception:
        pass

    # 5. Delete all auth users
    users_deleted = 0
    try:
        users = sb.auth.admin.list_users()
        for u in users:
            sb.auth.admin.delete_user(u.id)
            users_deleted += 1
    except Exception:
        pass

    return {
        "wiped": "hard-reset",
        "neo4j": neo4j_result,
        "supabase": supabase_result,
        "storage_files_deleted": storage_deleted,
        "users_deleted": users_deleted,
    }
