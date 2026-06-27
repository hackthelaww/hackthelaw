"""Timeline API — case evolution over time."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.auth_middleware import AuthUser, get_current_user
from app.db import read_query
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/cases/{slug}/timeline", tags=["timeline"])


@router.get("")
async def get_timeline(slug: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Get the full document timeline for a case, grouped by upload date."""

    case_uuid = get_case_uuid_by_slug(slug)
    if not case_uuid:
        raise HTTPException(404, f"Case '{slug}' not found")

    sb = get_supabase()

    # Fetch all case_documents ordered by created_at
    docs_result = (
        sb.table("case_documents")
        .select("*")
        .eq("case_id", case_uuid)
        .order("created_at")
        .execute()
    )
    docs = docs_result.data or []

    # Fetch entity counts per document from Neo4j
    entity_counts = await read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        OPTIONAL MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid})
        WHERE EXISTS { (e)<-[:MENTIONS]-(:Episode {payloadRef: d.id}) }
           OR EXISTS { MATCH (ep:Episode)-[:MENTIONS]->(d)
                       MATCH (ep)-[:MENTIONS]->(e) }
        RETURN d.id AS doc_id, d.filename AS filename, count(DISTINCT e) AS entity_count
        """,
        {"mid": slug},
    )
    entity_map = {r["doc_id"]: r["entity_count"] for r in entity_counts}

    # Total entities for the matter
    total_entities_result = await read_query(
        "MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid}) RETURN count(e) AS total",
        {"mid": slug},
    )
    total_entities = total_entities_result[0]["total"] if total_entities_result else 0

    # Resolve uploader UUIDs to emails
    uploader_ids = list({doc.get("uploaded_by", "") for doc in docs if doc.get("uploaded_by")})
    uploader_map: dict[str, str] = {}
    for uid in uploader_ids:
        try:
            user_info = sb.auth.admin.get_user_by_id(uid)
            if user_info and user_info.user:
                uploader_map[uid] = user_info.user.email or uid[:8]
        except Exception:
            uploader_map[uid] = uid[:8]

    # Build version chain lookup
    version_chains: dict[str, list[dict]] = defaultdict(list)
    for doc in docs:
        parent = doc.get("parent_document_id")
        if parent:
            version_chains[parent].append({
                "id": doc["id"],
                "filename": doc["filename"],
                "version_number": doc.get("version_number", 1),
            })

    # Fetch similarity parent filenames
    parent_filenames: dict[str, str] = {}
    for doc in docs:
        parent_id = doc.get("similarity_parent_id")
        if parent_id:
            for d in docs:
                if d["id"] == parent_id:
                    parent_filenames[doc["id"]] = d["filename"]
                    break

    # Group documents by calendar date
    batches_map: dict[str, list[dict]] = defaultdict(list)
    for doc in docs:
        created = doc.get("created_at", "")
        if isinstance(created, str) and len(created) >= 10:
            date_key = created[:10]  # YYYY-MM-DD
        else:
            date_key = "unknown"

        neo4j_doc_id = doc.get("neo4j_document_id", "")
        uploader_id = doc.get("uploaded_by", "")
        batches_map[date_key].append({
            "id": doc["id"],
            "filename": doc["filename"],
            "title": doc.get("title", ""),
            "uploaded_at": doc.get("created_at"),
            "uploaded_by": uploader_id,
            "uploaded_by_email": uploader_map.get(uploader_id, ""),
            "similarity_status": doc.get("similarity_status", "new"),
            "similarity_score": doc.get("similarity_score"),
            "similarity_parent_filename": parent_filenames.get(doc["id"]),
            "version_number": doc.get("version_number", 1),
            "version_chain": version_chains.get(doc["id"], []),
            "entity_count": entity_map.get(neo4j_doc_id, 0),
            "source": doc.get("source", "upload"),
            "extraction_status": doc.get("extraction_status", "pending"),
            "char_count": doc.get("char_count", 0),
        })

    # Build sorted batches with cumulative counts
    sorted_dates = sorted(batches_map.keys())
    batches = []
    cumulative_entities = 0
    cumulative_docs = 0

    for i, date in enumerate(sorted_dates):
        batch_docs = batches_map[date]
        batch_entities = sum(d["entity_count"] for d in batch_docs)
        new_docs = sum(1 for d in batch_docs if d["similarity_status"] != "exact_duplicate")
        cumulative_entities += batch_entities
        cumulative_docs += new_docs

        batches.append({
            "batch_date": date,
            "batch_index": i + 1,
            "documents": batch_docs,
            "new_doc_count": new_docs,
            "batch_entity_count": batch_entities,
            "cumulative_entity_count": cumulative_entities,
            "cumulative_doc_count": cumulative_docs,
        })

    # Fetch summary history
    summary_history = (
        sb.table("case_summary_history")
        .select("generated_at, doc_count, summary")
        .eq("case_id", case_uuid)
        .order("generated_at")
        .execute()
    )
    summary_snapshots = [
        {
            "generated_at": s["generated_at"],
            "doc_count": s["doc_count"],
            "key_facts_count": len(s.get("summary", {}).get("key_facts", [])),
        }
        for s in (summary_history.data or [])
    ]

    return {
        "batches": batches,
        "summary_snapshots": summary_snapshots,
        "total_documents": len(docs),
        "total_entities": total_entities,
        "total_duplicates_skipped": sum(1 for d in docs if d.get("similarity_status") == "exact_duplicate"),
        "date_range": {
            "first": sorted_dates[0] if sorted_dates else None,
            "last": sorted_dates[-1] if sorted_dates else None,
        },
    }
