"""Document ingestion routes — upload, confirm provenance, extract with AI.

Flow:
  1. POST /api/documents/upload         → extract text, upload to Supabase Storage, return preview
  2. POST /api/documents/confirm        → user confirms provenance, saves to graph + updates Supabase
  3. POST /api/documents/{id}/extract   → run Strands agent to extract entities
"""

import os
import uuid
import time
import tempfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.auth_middleware import AuthUser, get_current_user
from app.audit import log_action
from app.db import read_query, write_query
from app.ingest.extract_text import extract_text, content_hash
from app.ingest.similarity import find_similar_documents
from app.ingest.semantic_similarity import find_semantic_matches, SemanticSimilarityResult
from app.ingest.embeddings import embed_text, find_similar_by_embedding, cosine_similarity
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/documents", tags=["documents"])

# In-memory store for pending uploads (pre-confirmation)
_pending_uploads: dict[str, dict] = {}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _resolve_doc_uuid(doc_id: str) -> str | None:
    """Resolve a document ID (UUID or Neo4j ID) to a Supabase case_documents UUID."""
    if not doc_id:
        return None
    sb = get_supabase()
    # Try as UUID first
    try:
        r = sb.table("case_documents").select("id").eq("id", doc_id).maybe_single().execute()
        if r and r.data:
            return r.data["id"]
    except Exception:
        pass
    # Try as Neo4j document ID
    try:
        r = sb.table("case_documents").select("id").eq("neo4j_document_id", doc_id).maybe_single().execute()
        if r and r.data:
            return r.data["id"]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Step 1: Upload — extract text, store file, return preview
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    matter_id: str = Form(...),
    title: str = Form(""),
    simulated_date: str = Form(""),
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload a PDF or text file. Returns extracted text preview for confirmation.

    The document is NOT saved to the graph yet — call /confirm to finalize.
    File is uploaded to Supabase Storage immediately.
    """
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Determine content type
    ct = file.content_type or ""
    fn = file.filename.lower()
    if fn.endswith(".pdf"):
        ct = "application/pdf"
    elif fn.endswith((".md", ".txt", ".text")):
        ct = "text/plain"
    elif fn.endswith((".png",)):
        ct = "image/png"
    elif fn.endswith((".jpg", ".jpeg")):
        ct = "image/jpeg"
    elif fn.endswith(".eml"):
        ct = "message/rfc822"
    elif fn.endswith(".odt"):
        ct = "application/vnd.oasis.opendocument.text"
    elif fn.endswith(".docx"):
        ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    supported = ("application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg", "image/jpg", "message/rfc822", "application/vnd.oasis.opendocument.text", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    if ct not in supported:
        raise HTTPException(400, f"Unsupported file type: {ct}. Supported: PDF, TXT, MD, PNG, JPG, EML, ODT")

    # Verify matter exists in Neo4j
    rows = await read_query("MATCH (m:Matter {id: $id}) RETURN m.id AS id", {"id": matter_id})
    if not rows:
        raise HTTPException(404, f"Matter '{matter_id}' not found")

    # Look up the Supabase case UUID
    case_uuid = get_case_uuid_by_slug(matter_id)

    # Read file bytes
    file_bytes = await file.read()

    # Save to temp file and extract text
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        text = extract_text(tmp_path, ct)
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(422, "Could not extract any text from the file")

    # Generate IDs
    upload_id = str(uuid.uuid4())
    c_hash = content_hash(text)
    case_doc_id = str(uuid.uuid4())

    # Check for duplicate within this matter only
    existing = await read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        MATCH (d)-[:HAS_VERSION]->(v:Version {content_hash: $hash})
        RETURN v.id AS id, d.id AS doc_id LIMIT 1
        """,
        {"mid": matter_id, "hash": c_hash},
    )

    # Run similarity detection BEFORE inserting (so it doesn't find its own row)
    similarity = None
    if case_uuid:
        try:
            similarity = await find_similar_documents(
                new_text=text,
                new_hash=c_hash,
                matter_slug=matter_id,
                case_uuid=case_uuid,
                supabase_client=get_supabase(),
                neo4j_read_query=read_query,
            )
        except Exception:
            pass

    # Compute embedding for the new document
    new_embedding = embed_text(text)

    # If text-based similarity found nothing, try embedding-based similarity
    embedding_match = None
    if (not similarity or similarity.status == "new") and case_uuid and new_embedding:
        try:
            # Fetch existing document embeddings from Supabase
            existing_docs = (
                get_supabase()
                .table("case_documents")
                .select("id, filename, embedding")
                .eq("case_id", case_uuid)
                .not_.is_("embedding", "null")
                .execute()
            )
            if existing_docs and existing_docs.data:
                existing_embs = [
                    {"id": d["id"], "filename": d["filename"], "embedding": d["embedding"]}
                    for d in existing_docs.data
                    if d.get("embedding")
                ]
                matches = find_similar_by_embedding(new_embedding, existing_embs, threshold=0.75)
                if matches:
                    best = matches[0]
                    from app.ingest.similarity import SimilarityResult
                    if best["similarity"] >= 0.99:
                        # Near-identical — flag for user confirmation
                        similarity = SimilarityResult(
                            status="near_duplicate",
                            score=best["similarity"],
                            matched_document_id=best["id"],
                            matched_filename=best["filename"],
                            diff_summary=None,
                        )
                    elif best["similarity"] >= 0.85:
                        # High similarity — auto-link as evolved version (no user prompt)
                        similarity = SimilarityResult(
                            status="evolved_version",
                            score=best["similarity"],
                            matched_document_id=best["id"],
                            matched_filename=best["filename"],
                            diff_summary=None,
                        )
                    embedding_match = best
        except Exception:
            pass

    # If still no match, try semantic (LLM) comparison as last resort
    semantic_match: SemanticSimilarityResult | None = None
    if (not similarity or similarity.status == "new") and case_uuid:
        try:
            semantic_match = await find_semantic_matches(
                new_text=text,
                new_filename=file.filename or "",
                matter_slug=matter_id,
                neo4j_read_query=read_query,
            )
            # Promote semantic match to similarity result for downstream handling
            if semantic_match and semantic_match.relationship == "evolved_version":
                from app.ingest.similarity import SimilarityResult
                similarity = SimilarityResult(
                    status="near_duplicate",
                    score=semantic_match.confidence,
                    matched_document_id=semantic_match.matched_document_id,
                    matched_filename=semantic_match.matched_filename,
                    diff_summary=None,
                )
        except Exception:
            pass

    # Upload file to Supabase Storage
    storage_path = None
    if case_uuid:
        storage_path = f"{case_uuid}/{case_doc_id}/{file.filename}"
        try:
            get_supabase().storage.from_("case-documents").upload(
                storage_path, file_bytes, {"content-type": ct}
            )
        except Exception:
            storage_path = None

    # Insert pending row into Supabase case_documents (with similarity info)
    if case_uuid:
        try:
            doc_row: dict = {
                "id": case_doc_id,
                "case_id": case_uuid,
                "filename": file.filename,
                "title": title or file.filename,
                "content_hash": c_hash,
                "char_count": len(text),
                "storage_path": storage_path,
                "extraction_status": "pending",
                "uploaded_by": user.id,
                "similarity_status": ("evolved_version" if semantic_match and semantic_match.relationship == "evolved_version" else similarity.status) if similarity else "new",
                "similarity_score": similarity.score if similarity else None,
                "similarity_parent_id": _resolve_doc_uuid(similarity.matched_document_id) if similarity and similarity.matched_document_id else None,
                "semantic_explanation": semantic_match.explanation if semantic_match else "",
                "semantic_key_changes": semantic_match.key_changes if semantic_match else [],
                "embedding": new_embedding,
            }
            # Override created_at for timeline simulation
            if simulated_date:
                doc_row["created_at"] = f"{simulated_date}T12:00:00+00:00"
            get_supabase().table("case_documents").insert(doc_row).execute()
        except Exception:
            pass

    _pending_uploads[upload_id] = {
        "upload_id": upload_id,
        "matter_id": matter_id,
        "title": title or file.filename,
        "filename": file.filename,
        "content_type": ct,
        "text": text,
        "content_hash": c_hash,
        "char_count": len(text),
        "line_count": text.count("\n") + 1,
        "case_uuid": case_uuid,
        "case_doc_id": case_doc_id,
        "storage_path": storage_path,
    }

    log_action(
        "document_uploaded",
        case_id=case_uuid,
        user_id=user.id,
        details={"filename": file.filename, "upload_id": upload_id},
    )

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "title": title or file.filename,
        "content_hash": c_hash,
        "char_count": len(text),
        "line_count": text.count("\n") + 1,
        "preview": text[:2000],
        "full_text": text,
        "duplicate": existing[0] if existing else None,
        "similarity": similarity.to_dict() if similarity else None,
        "semantic_match": semantic_match.to_dict() if semantic_match else None,
        "embedding_match": embedding_match,
        "case_doc_id": case_doc_id,
    }


# ---------------------------------------------------------------------------
# Step 2: Confirm — user confirms provenance and saves to graph
# ---------------------------------------------------------------------------

class ConfirmRequest(BaseModel):
    upload_id: str
    source: str  # "human" | "ai" | "ocr" | "upload"
    author: str | None = None  # required if source=human
    model: str | None = None   # required if source=ai
    doc_type: str = ""         # "contract", "petition", "notes", "email", etc.


@router.post("/confirm")
async def confirm_document(body: ConfirmRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    """Confirm provenance and save the document + version to the graph."""
    pending = _pending_uploads.pop(body.upload_id, None)
    if not pending:
        raise HTTPException(404, f"Upload '{body.upload_id}' not found or already confirmed")

    # Validate provenance
    if body.source == "human" and not body.author:
        raise HTTPException(422, "author is required when source is 'human'")
    if body.source == "ai" and not body.model:
        raise HTTPException(422, "model is required when source is 'ai'")
    if body.source not in ("human", "ai", "ocr", "upload"):
        raise HTTPException(422, f"Invalid source: {body.source}. Use: human, ai, ocr, upload")

    matter_id = pending["matter_id"]
    document_id = f"{matter_id}::doc::{str(uuid.uuid4())[:8]}"
    version_id = f"{document_id}::v1"
    ts = _now_ms()

    # Create Document node in Neo4j
    await write_query(
        """
        MATCH (m:Matter {id: $mid})
        CREATE (d:Document {
            id: $did, title: $title, doc_type: $doc_type,
            matter_id: $mid, filename: $filename, created_at: $ts
        })
        CREATE (d)-[:BELONGS_TO]->(m)
        """,
        {
            "mid": matter_id, "did": document_id,
            "title": pending["title"], "doc_type": body.doc_type,
            "filename": pending["filename"], "ts": ts,
        },
    )

    # Create Version node (immutable snapshot with provenance)
    await write_query(
        """
        MATCH (d:Document {id: $did})
        CREATE (v:Version {
            id: $vid, version_no: 1, source: $source,
            content: $content, content_hash: $hash,
            author: $author, model: $model, created_at: $ts,
            document_id: $did
        })
        CREATE (d)-[:HAS_VERSION]->(v)
        """,
        {
            "did": document_id, "vid": version_id,
            "source": body.source, "content": pending["text"],
            "hash": pending["content_hash"],
            "author": body.author, "model": body.model, "ts": ts,
        },
    )

    # Create Episode tracking this ingestion
    episode_id = str(uuid.uuid4())
    await write_query(
        """
        CREATE (e:Episode {
            id: $eid, kind: 'DOCUMENT_INGESTED',
            label: $label, payloadRef: $did, createdAt: $ts
        })
        WITH e
        MATCH (d:Document {id: $did})
        MERGE (e)-[:MENTIONS]->(d)
        """,
        {
            "eid": episode_id,
            "label": f"Document uploaded: {pending['title']}",
            "did": document_id, "ts": ts,
        },
    )

    # Update Supabase case_documents row with Neo4j references
    case_uuid = pending.get("case_uuid")
    case_doc_id = pending.get("case_doc_id")
    if case_uuid and case_doc_id:
        try:
            get_supabase().table("case_documents").update({
                "source": body.source,
                "author": body.author,
                "ai_model": body.model,
                "doc_type": body.doc_type,
                "neo4j_document_id": document_id,
                "neo4j_episode_id": episode_id,
            }).eq("id", case_doc_id).execute()
        except Exception:
            pass

    log_action(
        "document_confirmed",
        case_id=case_uuid,
        user_id=user.id,
        details={"document_id": document_id, "source": body.source},
    )

    return {
        "document_id": document_id,
        "version_id": version_id,
        "episode_id": episode_id,
        "content_hash": pending["content_hash"],
        "source": body.source,
        "title": pending["title"],
    }


# ---------------------------------------------------------------------------
# Step 3: Extract — run Strands agent to parse document into graph nodes
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    provider: str = "anthropic"           # "anthropic", "openai", "ollama"
    model_name: str = "claude-haiku-4-5-20251001"
    api_key: str = ""                     # user provides their key
    api_endpoint: str = ""                # custom endpoint (e.g. Ollama URL)


@router.post("/{document_id}/extract")
async def extract_document(document_id: str, body: ExtractRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    """Run the AI extraction agent on a saved document."""

    # Fetch document and its latest version text
    rows = await read_query(
        """
        MATCH (d:Document {id: $did})-[:HAS_VERSION]->(v:Version)
        RETURN d.matter_id AS matter_id, d.title AS title, v.content AS content, v.id AS version_id
        ORDER BY v.version_no DESC LIMIT 1
        """,
        {"did": document_id},
    )
    if not rows:
        raise HTTPException(404, f"Document '{document_id}' not found or has no versions")

    row = rows[0]
    matter_id = row["matter_id"]
    text = row["content"]

    # Look up Supabase case_document for status tracking
    case_uuid = get_case_uuid_by_slug(matter_id)
    sb_doc = None
    if case_uuid:
        try:
            sb_result = (
                get_supabase()
                .table("case_documents")
                .select("id")
                .eq("neo4j_document_id", document_id)
                .maybe_single()
                .execute()
            )
            sb_doc = sb_result.data if sb_result else None
        except Exception:
            sb_doc = None

    # Update extraction status to 'processing'
    if sb_doc:
        try:
            get_supabase().table("case_documents").update(
                {"extraction_status": "processing"}
            ).eq("id", sb_doc["id"]).execute()
        except Exception:
            pass

    log_action(
        "extraction_started",
        case_id=case_uuid,
        user_id=user.id,
        details={"document_id": document_id},
    )

    # Use API key from request, fall back to env
    api_key = body.api_key
    if not api_key and body.provider == "anthropic":
        from app.config import settings
        api_key = settings.anthropic_api_key

    if not api_key and body.provider in ("anthropic", "openai"):
        raise HTTPException(422, f"API key required for provider '{body.provider}'.")

    from app.ingest.extraction_agent import run_extraction

    try:
        result = await run_extraction(
            document_text=text,
            matter_id=matter_id,
            document_id=document_id,
            provider=body.provider,
            model_name=body.model_name,
            api_key=api_key,
            api_endpoint=body.api_endpoint,
        )

        # Update Supabase: done + entity count
        if sb_doc:
            try:
                get_supabase().table("case_documents").update({
                    "extraction_status": "done",
                    "extracted_entity_count": len(result["entities"]),
                }).eq("id", sb_doc["id"]).execute()
            except Exception:
                pass

        log_action(
            "extraction_completed",
            case_id=case_uuid,
            user_id=user.id,
            details={
                "document_id": document_id,
                "entities": len(result["entities"]),
                "relations": len(result["relations"]),
            },
        )

        # Run case intelligence agent (classify changes, detect inconsistencies)
        try:
            from app.ingest.case_intelligence import run_case_intelligence, store_case_events
            doc_title = row.get("title") or document_id
            events = await run_case_intelligence(
                matter_id=matter_id,
                new_document_title=doc_title,
                new_document_id=document_id,
            )
            if events:
                # Get the document's date from case_documents (uses simulated date if set)
                event_date = None
                try:
                    doc_rows = (
                        get_supabase()
                        .table("case_documents")
                        .select("created_at")
                        .eq("neo4j_document_id", document_id)
                        .limit(1)
                        .execute()
                    )
                    if doc_rows and doc_rows.data:
                        event_date = doc_rows.data[0]["created_at"][:10]
                except Exception:
                    pass
                # Fallback: try by case_id + filename match
                if not event_date and case_uuid:
                    try:
                        doc_rows = (
                            get_supabase()
                            .table("case_documents")
                            .select("created_at")
                            .eq("case_id", case_uuid)
                            .order("created_at", desc=True)
                            .limit(1)
                            .execute()
                        )
                        if doc_rows and doc_rows.data:
                            event_date = doc_rows.data[0]["created_at"][:10]
                    except Exception:
                        pass
                await store_case_events(matter_id, events, event_date=event_date)
        except Exception:
            pass  # Intelligence analysis should never block extraction

        return {
            "document_id": document_id,
            "matter_id": matter_id,
            "episode_id": result["episode_id"],
            "entities_extracted": len(result["entities"]),
            "relations_extracted": len(result["relations"]),
            "entities": result["entities"],
            "relations": result["relations"],
        }

    except Exception as e:
        # Update Supabase: failed
        if sb_doc:
            try:
                get_supabase().table("case_documents").update(
                    {"extraction_status": "failed"}
                ).eq("id", sb_doc["id"]).execute()
            except Exception:
                pass

        log_action(
            "extraction_failed",
            case_id=case_uuid,
            user_id=user.id,
            details={"document_id": document_id, "error": str(e)},
        )
        raise


# ---------------------------------------------------------------------------
# Download — signed URL from Supabase Storage
# ---------------------------------------------------------------------------

@router.get("/{document_id}/download")
async def download_document(document_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Get a signed download URL for a document's file."""
    sb_result = (
        get_supabase()
        .table("case_documents")
        .select("storage_path, case_id")
        .eq("neo4j_document_id", document_id)
        .maybe_single()
        .execute()
    )
    if not sb_result.data or not sb_result.data.get("storage_path"):
        raise HTTPException(404, "File not found in storage")

    storage_path = sb_result.data["storage_path"]
    signed = get_supabase().storage.from_("case-documents").create_signed_url(storage_path, 3600)

    return {"url": signed["signedURL"], "expires_in": 3600}


# ---------------------------------------------------------------------------
# List documents for a matter
# ---------------------------------------------------------------------------

@router.get("/by-matter/{matter_id}")
async def list_documents_for_matter(matter_id: str) -> list[dict]:
    """List all documents for a matter, combining Supabase metadata + Neo4j version info."""

    # Try Supabase first
    case_uuid = get_case_uuid_by_slug(matter_id)
    if case_uuid:
        sb_docs = (
            get_supabase()
            .table("case_documents")
            .select("*")
            .eq("case_id", case_uuid)
            .order("created_at", desc=True)
            .execute()
        )
        if sb_docs.data:
            return sb_docs.data

    # Fallback to Neo4j-only query
    rows = await read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        OPTIONAL MATCH (d)-[:HAS_VERSION]->(v:Version)
        WITH d, count(v) AS version_count, max(v.created_at) AS latest_version_at
        RETURN d {.id, .title, .doc_type, .filename, .created_at} AS doc,
               version_count, latest_version_at
        ORDER BY d.created_at DESC
        """,
        {"mid": matter_id},
    )
    return [
        {**r["doc"], "version_count": r["version_count"], "latest_version_at": r["latest_version_at"]}
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Link a near-duplicate as a new version of an existing document
# ---------------------------------------------------------------------------

class LinkVersionRequest(BaseModel):
    new_document_id: str      # case_documents.id of the new upload
    parent_document_id: str   # case_documents.id of the existing doc


@router.post("/link-version")
async def link_as_version(body: LinkVersionRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    """Link a near-duplicate document as a new version of an existing document.

    Accepts both Supabase UUIDs and Neo4j document IDs — resolves automatically.
    """
    sb = get_supabase()

    def resolve_to_uuid(doc_id: str) -> str | None:
        """Try as UUID first, then as neo4j_document_id."""
        try:
            r = sb.table("case_documents").select("id, version_number").eq("id", doc_id).maybe_single().execute()
            if r and r.data:
                return r.data["id"]
        except Exception:
            pass
        try:
            r = sb.table("case_documents").select("id, version_number").eq("neo4j_document_id", doc_id).maybe_single().execute()
            if r and r.data:
                return r.data["id"]
        except Exception:
            pass
        return None

    parent_uuid = resolve_to_uuid(body.parent_document_id)
    new_uuid = resolve_to_uuid(body.new_document_id)

    if not parent_uuid:
        raise HTTPException(404, "Parent document not found")
    if not new_uuid:
        raise HTTPException(404, "New document not found")

    # Get parent version number
    try:
        parent = sb.table("case_documents").select("version_number").eq("id", parent_uuid).single().execute()
        new_version = (parent.data.get("version_number") or 1) + 1 if parent.data else 2
    except Exception:
        new_version = 2

    try:
        sb.table("case_documents").update({
            "parent_document_id": parent_uuid,
            "version_number": new_version,
        }).eq("id", new_uuid).execute()
    except Exception as e:
        raise HTTPException(500, f"Failed to link version: {e}")

    return {"linked": True, "version_number": new_version}


# ---------------------------------------------------------------------------
# Diff — compare a document with its similarity parent
# ---------------------------------------------------------------------------

@router.get("/{document_id}/diff")
async def get_document_diff(document_id: str) -> dict:
    """Get a diff between a near-duplicate document and its similarity parent."""
    sb = get_supabase()

    # Find this document and its similarity parent
    doc_result = (
        sb.table("case_documents")
        .select("id, filename, similarity_parent_id, similarity_score, neo4j_document_id")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not doc_result or not doc_result.data:
        raise HTTPException(404, "Document not found")

    doc = doc_result.data
    parent_id = doc.get("similarity_parent_id")
    if not parent_id:
        raise HTTPException(422, "Document has no similarity parent — not a near-duplicate")

    # Get parent's Neo4j document ID
    parent_result = (
        sb.table("case_documents")
        .select("filename, neo4j_document_id")
        .eq("id", parent_id)
        .maybe_single()
        .execute()
    )
    if not parent_result or not parent_result.data:
        raise HTTPException(404, "Parent document not found")

    parent = parent_result.data

    # Fetch text content from Neo4j for both documents
    async def get_text(neo4j_doc_id: str) -> str:
        rows = await read_query(
            """
            MATCH (d:Document {id: $did})-[:HAS_VERSION]->(v:Version)
            RETURN v.content AS content ORDER BY v.version_no DESC LIMIT 1
            """,
            {"did": neo4j_doc_id},
        )
        return rows[0]["content"] if rows else ""

    new_text = await get_text(doc.get("neo4j_document_id", ""))
    parent_text = await get_text(parent.get("neo4j_document_id", ""))

    if not new_text or not parent_text:
        raise HTTPException(422, "Could not fetch document text for comparison")

    import difflib

    # Generate unified diff for raw view
    from app.ingest.similarity import compute_diff_summary
    diff_summary = compute_diff_summary(parent_text, new_text, max_lines=100)

    # Generate structured side-by-side diff (GitHub-style)
    parent_lines = parent_text.splitlines()
    new_lines = new_text.splitlines()
    matcher = difflib.SequenceMatcher(None, parent_lines, new_lines)

    diff_blocks: list[dict] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i1, i2):
                diff_blocks.append({
                    "type": "equal",
                    "old_line": k + 1,
                    "new_line": j1 + (k - i1) + 1,
                    "old_text": parent_lines[k],
                    "new_text": new_lines[j1 + (k - i1)],
                })
        elif tag == "replace":
            max_len = max(i2 - i1, j2 - j1)
            for k in range(max_len):
                diff_blocks.append({
                    "type": "changed",
                    "old_line": (i1 + k + 1) if k < (i2 - i1) else None,
                    "new_line": (j1 + k + 1) if k < (j2 - j1) else None,
                    "old_text": parent_lines[i1 + k] if k < (i2 - i1) else "",
                    "new_text": new_lines[j1 + k] if k < (j2 - j1) else "",
                })
        elif tag == "delete":
            for k in range(i1, i2):
                diff_blocks.append({
                    "type": "removed",
                    "old_line": k + 1,
                    "new_line": None,
                    "old_text": parent_lines[k],
                    "new_text": "",
                })
        elif tag == "insert":
            for k in range(j1, j2):
                diff_blocks.append({
                    "type": "added",
                    "old_line": None,
                    "new_line": k + 1,
                    "old_text": "",
                    "new_text": new_lines[k],
                })

    return {
        "original_filename": parent["filename"],
        "new_filename": doc["filename"],
        "similarity_score": doc.get("similarity_score"),
        "diff_summary": diff_summary,
        "diff_blocks": diff_blocks,
        "original_chars": len(parent_text),
        "new_chars": len(new_text),
        "stats": {
            "additions": sum(1 for b in diff_blocks if b["type"] in ("added", "changed") and b["new_text"]),
            "deletions": sum(1 for b in diff_blocks if b["type"] in ("removed", "changed") and b["old_text"]),
            "unchanged": sum(1 for b in diff_blocks if b["type"] == "equal"),
        },
    }


# ---------------------------------------------------------------------------
# Annotations — AI-generated review notes for document comparisons
# ---------------------------------------------------------------------------

@router.get("/{document_id}/annotations")
async def get_annotations(document_id: str) -> dict:
    """Get AI annotations for a document. Generates on-demand if not cached."""
    sb = get_supabase()

    # Check if annotations are already cached
    doc_result = (
        sb.table("case_documents")
        .select("id, annotations, similarity_status, similarity_parent_id, neo4j_document_id")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not doc_result or not doc_result.data:
        raise HTTPException(404, "Document not found")

    doc = doc_result.data

    # Return cached annotations if available
    if doc.get("annotations"):
        return {"annotations": doc["annotations"], "cached": True}

    # Generate on-demand if this is a near-duplicate or evolved version
    parent_id = doc.get("similarity_parent_id")
    if not parent_id:
        return {"annotations": [], "cached": False, "reason": "No parent document to compare against"}

    # Fetch parent's Neo4j doc ID
    parent_result = (
        sb.table("case_documents")
        .select("neo4j_document_id")
        .eq("id", parent_id)
        .maybe_single()
        .execute()
    )
    if not parent_result or not parent_result.data:
        return {"annotations": [], "cached": False, "reason": "Parent document not found"}

    # Fetch both document texts from Neo4j
    async def get_text(neo4j_doc_id: str) -> str:
        rows = await read_query(
            "MATCH (d:Document {id: $did})-[:HAS_VERSION]->(v:Version) RETURN v.content AS content ORDER BY v.version_no DESC LIMIT 1",
            {"did": neo4j_doc_id},
        )
        return rows[0]["content"] if rows else ""

    new_text = await get_text(doc.get("neo4j_document_id", ""))
    parent_text = await get_text(parent_result.data.get("neo4j_document_id", ""))

    if not new_text or not parent_text:
        return {"annotations": [], "cached": False, "reason": "Could not fetch document text"}

    # Generate annotations
    from app.ingest.annotation_agent import generate_annotations
    annotations = generate_annotations(parent_text, new_text)

    # Cache in Supabase
    if annotations:
        try:
            sb.table("case_documents").update({"annotations": annotations}).eq("id", document_id).execute()
        except Exception:
            pass

    return {"annotations": annotations, "cached": False}


# ---------------------------------------------------------------------------
# Document Content — view the extracted text
# ---------------------------------------------------------------------------

@router.get("/{document_id}/content")
async def get_document_content(document_id: str) -> dict:
    """Get the extracted text content of a document.

    Tries by Supabase case_documents.id first (UUID), then by Neo4j document ID.
    """
    sb = get_supabase()

    # Look up by UUID first, then Neo4j ID, then filename
    neo4j_doc_id = None
    filename = ""

    # Try as Supabase UUID
    try:
        sb_doc = sb.table("case_documents").select("neo4j_document_id, filename, title").eq("id", document_id).maybe_single().execute()
        if sb_doc and sb_doc.data:
            neo4j_doc_id = sb_doc.data.get("neo4j_document_id")
            filename = sb_doc.data.get("filename", "")
    except Exception:
        pass

    # Try as filename (for when source_documents stores filenames)
    if not neo4j_doc_id:
        try:
            sb_doc = sb.table("case_documents").select("neo4j_document_id, filename, title").eq("filename", document_id).limit(1).execute()
            if sb_doc and sb_doc.data:
                neo4j_doc_id = sb_doc.data[0].get("neo4j_document_id")
                filename = sb_doc.data[0].get("filename", "")
        except Exception:
            pass

    # If no Supabase match, try as Neo4j doc ID directly
    if not neo4j_doc_id:
        neo4j_doc_id = document_id

    rows = await read_query(
        """
        MATCH (d:Document {id: $did})-[:HAS_VERSION]->(v:Version)
        RETURN v.content AS content, d.title AS title, d.filename AS filename
        ORDER BY v.version_no DESC LIMIT 1
        """,
        {"did": neo4j_doc_id},
    )
    if not rows:
        raise HTTPException(404, "Document content not found")

    return {
        "content": rows[0]["content"],
        "title": rows[0].get("title") or filename,
        "filename": rows[0].get("filename") or filename,
    }


# ---------------------------------------------------------------------------
# Document Lifecycle — version history as an object timeline
# ---------------------------------------------------------------------------

@router.get("/{document_id}/lifecycle")
async def get_document_lifecycle(document_id: str) -> dict:
    """Get the full version lifecycle of a document object.

    Traces the version chain (parent_document_id links) to build a timeline
    of how this document evolved: initial upload → minor edits → major rewrites.
    """
    sb = get_supabase()

    # Find the root document (walk up the parent chain)
    root_id = document_id
    visited = set()
    while True:
        if root_id in visited:
            break
        visited.add(root_id)
        result = sb.table("case_documents").select("id, parent_document_id, similarity_parent_id").eq("id", root_id).maybe_single().execute()
        if not result or not result.data:
            break
        parent = result.data.get("parent_document_id") or result.data.get("similarity_parent_id")
        if not parent or parent == root_id:
            break
        root_id = parent

    # Now collect all versions: root + all docs that point to root (or each other in chain)
    # Get all case_documents for the same case
    root_doc = sb.table("case_documents").select("case_id, filename, title").eq("id", root_id).maybe_single().execute()
    if not root_doc or not root_doc.data:
        raise HTTPException(404, "Document not found")

    case_id = root_doc.data["case_id"]
    all_docs = sb.table("case_documents").select("*").eq("case_id", case_id).order("created_at").execute()

    # Build the version chain from root
    chain_ids = {root_id}
    changed = True
    while changed:
        changed = False
        for doc in (all_docs.data or []):
            if doc["id"] in chain_ids:
                continue
            parent = doc.get("parent_document_id") or doc.get("similarity_parent_id")
            if parent and parent in chain_ids:
                chain_ids.add(doc["id"])
                changed = True

    # Also add docs where the root is THEIR similarity parent
    for doc in (all_docs.data or []):
        if doc.get("similarity_parent_id") in chain_ids or doc.get("parent_document_id") in chain_ids:
            chain_ids.add(doc["id"])

    # Filter and sort by created_at
    chain_docs = [d for d in (all_docs.data or []) if d["id"] in chain_ids]
    chain_docs.sort(key=lambda d: d.get("created_at", ""))

    # Build version nodes
    versions = []
    for i, doc in enumerate(chain_docs):
        is_first = i == 0
        is_last = i == len(chain_docs) - 1

        # Determine change type
        sim_status = doc.get("similarity_status", "new")
        if is_first:
            change_type = "initial"
        elif sim_status in ("evolved_version", "similar"):
            change_type = "major"
        elif sim_status == "near_duplicate":
            change_type = "minor"
        elif is_last:
            change_type = "current"
        else:
            change_type = "minor"

        # Override last real doc as "current"
        if is_last and change_type != "initial":
            change_type = "current"

        version_num = doc.get("version_number", i + 1)
        major = version_num
        minor = 0
        if change_type == "minor" and i > 0:
            prev_version = versions[-1]["version"] if versions else "1.0"
            parts = prev_version.split(".")
            major = int(parts[0])
            minor = int(parts[1]) + 1 if len(parts) > 1 else 1
        elif change_type in ("major", "current") and versions:
            prev_version = versions[-1]["version"]
            parts = prev_version.split(".")
            major = int(parts[0]) + 1
            minor = 0
        elif is_first:
            major = 1
            minor = 0

        version_str = f"{major}.{minor}"

        # Get uploader info
        uploaded_by = doc.get("uploaded_by", "")
        try:
            user_info = sb.auth.admin.get_user_by_id(uploaded_by)
            email = user_info.user.email if user_info and user_info.user else uploaded_by[:8]
        except Exception:
            email = uploaded_by[:8] if uploaded_by else "unknown"

        versions.append({
            "id": doc["id"],
            "version": version_str,
            "date": doc.get("created_at", ""),
            "uploaded_by_email": email,
            "change_type": change_type,
            "similarity_score": doc.get("similarity_score"),
            "entity_count": doc.get("extracted_entity_count", 0),
            "key_changes": doc.get("semantic_key_changes", []),
            "semantic_explanation": doc.get("semantic_explanation", ""),
        })

    return {
        "document_name": root_doc.data.get("title") or root_doc.data.get("filename", ""),
        "document_type": chain_docs[0].get("doc_type", "") if chain_docs else "",
        "total_versions": len(versions),
        "versions": versions,
        "reviews": [],
    }
