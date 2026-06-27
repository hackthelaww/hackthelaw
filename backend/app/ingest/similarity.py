"""Document similarity detection — flags duplicates and near-duplicates on upload.

Two-tier algorithm:
  1. Exact match via SHA-256 content_hash
  2. Near-duplicate via SimHash screening + SequenceMatcher confirmation
"""

from __future__ import annotations

import difflib
import hashlib
from dataclasses import dataclass, asdict


@dataclass
class SimilarityResult:
    status: str              # "exact_duplicate" | "near_duplicate" | "similar" | "new"
    score: float             # 0.0 to 1.0
    matched_document_id: str | None
    matched_filename: str | None
    diff_summary: str | None

    def to_dict(self) -> dict:
        return asdict(self)


def compute_simhash(text: str, k: int = 3) -> int:
    """Compute a 64-bit SimHash fingerprint from character k-grams."""
    if len(text) < k:
        return 0
    v = [0] * 64
    for i in range(len(text) - k + 1):
        token = text[i:i + k]
        h = int(hashlib.md5(token.encode()).hexdigest(), 16)
        for bit in range(64):
            if h & (1 << bit):
                v[bit] += 1
            else:
                v[bit] -= 1
    fingerprint = 0
    for bit in range(64):
        if v[bit] > 0:
            fingerprint |= (1 << bit)
    return fingerprint


def hamming_distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def compute_diff_summary(text_a: str, text_b: str, max_lines: int = 20) -> str:
    """Generate a human-readable diff summary between two texts."""
    lines_a = text_a.splitlines(keepends=True)
    lines_b = text_b.splitlines(keepends=True)
    diff = list(difflib.unified_diff(lines_a, lines_b, lineterm="", n=1))
    changes = [line for line in diff if line.startswith("+") or line.startswith("-")]
    # Skip the --- / +++ header lines
    changes = [c for c in changes if not c.startswith("---") and not c.startswith("+++")]
    return "".join(changes[:max_lines])


async def find_similar_documents(
    new_text: str,
    new_hash: str,
    matter_slug: str,
    case_uuid: str,
    supabase_client,
    neo4j_read_query,
) -> SimilarityResult:
    """Compare a new document against all existing documents in a case.

    Args:
        new_text: Extracted text of the new document.
        new_hash: SHA-256 hash of new_text.
        matter_slug: The Neo4j Matter ID (slug).
        case_uuid: The Supabase cases.id (UUID).
        supabase_client: Supabase client instance.
        neo4j_read_query: Async function to run Neo4j read queries.

    Returns:
        SimilarityResult with status, score, matched doc info, and optional diff.
    """
    # Tier 1: Exact hash match in Supabase
    exact = (
        supabase_client.table("case_documents")
        .select("id, filename")
        .eq("case_id", case_uuid)
        .eq("content_hash", new_hash)
        .limit(1)
        .execute()
    )
    if exact.data:
        return SimilarityResult(
            status="exact_duplicate",
            score=1.0,
            matched_document_id=exact.data[0]["id"],
            matched_filename=exact.data[0]["filename"],
            diff_summary=None,
        )

    # Tier 2: Fetch existing document texts from Neo4j
    existing_docs = await neo4j_read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        MATCH (d)-[:HAS_VERSION]->(v:Version)
        WITH d, v ORDER BY v.version_no DESC
        WITH d, head(collect(v)) AS latest_v
        RETURN d.id AS doc_id, d.filename AS filename, latest_v.content AS content
        """,
        {"mid": matter_slug},
    )

    if not existing_docs:
        return SimilarityResult(
            status="new", score=0.0,
            matched_document_id=None, matched_filename=None, diff_summary=None,
        )

    # SimHash screening
    new_simhash = compute_simhash(new_text)
    candidates = []
    for doc in existing_docs:
        if not doc.get("content"):
            continue
        doc_simhash = compute_simhash(doc["content"])
        dist = hamming_distance(new_simhash, doc_simhash)
        if dist <= 10:
            candidates.append(doc)

    if not candidates:
        return SimilarityResult(
            status="new", score=0.0,
            matched_document_id=None, matched_filename=None, diff_summary=None,
        )

    # SequenceMatcher on candidates
    best_score = 0.0
    best_doc = None
    for doc in candidates:
        ratio = difflib.SequenceMatcher(None, new_text, doc["content"]).ratio()
        if ratio > best_score:
            best_score = ratio
            best_doc = doc

    if best_score >= 0.95:
        diff = compute_diff_summary(best_doc["content"], new_text)
        return SimilarityResult(
            status="near_duplicate",
            score=round(best_score, 4),
            matched_document_id=best_doc["doc_id"],
            matched_filename=best_doc["filename"],
            diff_summary=diff,
        )
    elif best_score >= 0.70:
        return SimilarityResult(
            status="similar",
            score=round(best_score, 4),
            matched_document_id=best_doc["doc_id"],
            matched_filename=best_doc["filename"],
            diff_summary=None,
        )

    return SimilarityResult(
        status="new", score=round(best_score, 4),
        matched_document_id=None, matched_filename=None, diff_summary=None,
    )
