"""Semantic document comparison via LLM.

Goes beyond text similarity — detects when two documents are about the same
legal matter/purpose even if the wording is completely different (e.g., a
formal complaint rewritten by a different lawyer).

Returns a classification:
  - evolved_version: Same document, improved/expanded
  - same_topic: Same legal matter but different document type
  - unrelated: Different documents entirely
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict

from anthropic import Anthropic

from app.config import settings


COMPARISON_PROMPT = """You are a legal document analyst. Compare these two documents and determine their relationship.

DOCUMENT A (existing):
Title: {title_a}
Preview (first 800 chars):
{preview_a}

DOCUMENT B (new upload):
Title: {title_b}
Preview (first 800 chars):
{preview_b}

Respond with ONLY valid JSON:
{{
  "relationship": "evolved_version" | "same_topic" | "unrelated",
  "confidence": 0.0 to 1.0,
  "explanation": "one sentence explaining your reasoning",
  "key_changes": ["list of what changed between A and B, if evolved_version"]
}}

Definitions:
- evolved_version: STRICTLY means the SAME document rewritten or improved. Both documents must be the SAME TYPE (e.g., both are complaint letters, both are contracts, both are witness statements). They must serve the same purpose and function. Simply sharing the same parties or the same legal matter is NOT enough.
- same_topic: Documents about the same legal matter or case but DIFFERENT types. For example: an email from a client AND a formal complaint letter about the same case are "same_topic", NOT "evolved_version". A performance review AND a dismissal letter are "same_topic". An informal note AND a formal pleading are "same_topic".
- unrelated: Different legal matters or no meaningful connection.

CRITICAL: An email is NEVER an evolved_version of a formal complaint (or vice versa). A performance review is NEVER an evolved_version of a pleading. Different document types = same_topic at most, NEVER evolved_version.

Return ONLY the JSON object."""


@dataclass
class SemanticSimilarityResult:
    relationship: str       # evolved_version | same_topic | unrelated
    confidence: float       # 0.0 to 1.0
    explanation: str
    key_changes: list[str]
    matched_document_id: str | None
    matched_filename: str | None

    def to_dict(self) -> dict:
        return asdict(self)


async def find_semantic_matches(
    new_text: str,
    new_filename: str,
    matter_slug: str,
    neo4j_read_query,
) -> SemanticSimilarityResult | None:
    """Compare a new document semantically against all existing docs in a case.

    Uses LLM to detect evolved versions even when text similarity is low.
    Only runs if text-based similarity didn't already find a match.
    """
    if not settings.anthropic_api_key:
        return None

    # Fetch existing documents with their text previews
    existing_docs = await neo4j_read_query(
        """
        MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
        MATCH (d)-[:HAS_VERSION]->(v:Version)
        WITH d, v ORDER BY v.version_no DESC
        WITH d, head(collect(v)) AS latest_v
        RETURN d.id AS doc_id, d.title AS title, d.filename AS filename,
               substring(latest_v.content, 0, 800) AS preview
        """,
        {"mid": matter_slug},
    )

    if not existing_docs:
        return None

    new_preview = new_text[:800]
    client = Anthropic(api_key=settings.anthropic_api_key)

    best_match: SemanticSimilarityResult | None = None
    best_confidence = 0.0

    for doc in existing_docs:
        if not doc.get("preview"):
            continue

        prompt = COMPARISON_PROMPT.format(
            title_a=doc.get("title") or doc.get("filename") or "Unknown",
            preview_a=doc["preview"],
            title_b=new_filename,
            preview_b=new_preview,
        )

        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = response.content[0].text
            json_match = re.search(r"\{[\s\S]*\}", response_text)
            if not json_match:
                continue

            result = json.loads(json_match.group())
            relationship = result.get("relationship", "unrelated")
            confidence = float(result.get("confidence", 0))

            if relationship in ("evolved_version", "same_topic") and confidence > best_confidence:
                best_confidence = confidence
                best_match = SemanticSimilarityResult(
                    relationship=relationship,
                    confidence=confidence,
                    explanation=result.get("explanation", ""),
                    key_changes=result.get("key_changes", []),
                    matched_document_id=doc["doc_id"],
                    matched_filename=doc.get("filename") or doc.get("title"),
                )

        except Exception:
            continue

    # Only return if confidence is meaningful
    if best_match and best_match.confidence >= 0.6:
        return best_match

    return None
