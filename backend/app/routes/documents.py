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
from app.supabase_client import get_supabase, get_case_uuid_by_slug

router = APIRouter(prefix="/api/documents", tags=["documents"])

# In-memory store for pending uploads (pre-confirmation)
_pending_uploads: dict[str, dict] = {}


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Step 1: Upload — extract text, store file, return preview
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    matter_id: str = Form(...),
    title: str = Form(""),
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

    supported = ("application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg", "image/jpg", "message/rfc822", "application/vnd.oasis.opendocument.text")
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

    # Check for duplicate
    existing = await read_query(
        "MATCH (v:Version {content_hash: $hash}) RETURN v.id AS id, v.document_id AS doc_id LIMIT 1",
        {"hash": c_hash},
    )

    # Upload file to Supabase Storage
    storage_path = None
    if case_uuid:
        storage_path = f"{case_uuid}/{case_doc_id}/{file.filename}"
        try:
            get_supabase().storage.from_("case-documents").upload(
                storage_path, file_bytes, {"content-type": ct}
            )
        except Exception:
            storage_path = None  # Storage upload failed, continue without it

    # Insert pending row into Supabase case_documents
    sb_doc_data = None
    if case_uuid:
        try:
            sb_result = (
                get_supabase()
                .table("case_documents")
                .insert({
                    "id": case_doc_id,
                    "case_id": case_uuid,
                    "filename": file.filename,
                    "title": title or file.filename,
                    "content_hash": c_hash,
                    "char_count": len(text),
                    "storage_path": storage_path,
                    "extraction_status": "pending",
                    "uploaded_by": user.id,
                })
                .execute()
            )
            sb_doc_data = sb_result.data[0] if sb_result.data else None
        except Exception:
            pass  # Supabase insert failed, continue with Neo4j-only flow

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

    # Run similarity detection against existing docs in the case
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
            # Update Supabase row with similarity info
            get_supabase().table("case_documents").update({
                "similarity_status": similarity.status,
                "similarity_score": similarity.score,
                "similarity_parent_id": similarity.matched_document_id,
            }).eq("id", case_doc_id).execute()
        except Exception:
            pass  # Similarity detection failed, continue

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
        sb_result = (
            get_supabase()
            .table("case_documents")
            .select("id")
            .eq("neo4j_document_id", document_id)
            .maybe_single()
            .execute()
        )
        sb_doc = sb_result.data

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
    """Link a near-duplicate document as a new version of an existing document."""
    parent = (
        get_supabase()
        .table("case_documents")
        .select("version_number")
        .eq("id", body.parent_document_id)
        .single()
        .execute()
    )
    if not parent.data:
        raise HTTPException(404, "Parent document not found")

    new_version = (parent.data.get("version_number") or 1) + 1

    get_supabase().table("case_documents").update({
        "parent_document_id": body.parent_document_id,
        "version_number": new_version,
    }).eq("id", body.new_document_id).execute()

    return {"linked": True, "version_number": new_version}
