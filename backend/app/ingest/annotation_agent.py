"""Document annotation agent — compares two document versions and produces
inline annotations highlighting what changed, improved, or is concerning.

Triggered when an evolved_version or near_duplicate is detected.
Produces annotations with character offsets into the NEW document text.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict

from anthropic import Anthropic

from app.config import settings


ANNOTATION_PROMPT = """You are an expert legal document reviewer. You are comparing two versions of the same legal document.

ORIGINAL DOCUMENT:
{original_text}

NEW DOCUMENT (the one being annotated):
{new_text}

Analyze the differences and produce annotations for the NEW document. For each noteworthy change, addition, or issue, create an annotation.

Return ONLY a valid JSON array of annotations. Each annotation must have:
{{
  "category": "issue" | "suggestion" | "strength" | "grammar" | "weak_argument" | "change",
  "severity": "high" | "medium" | "low",
  "text_span": "the exact text from the NEW document to highlight (must be a verbatim substring)",
  "note": "explanation of the annotation (2-3 sentences max)",
  "quote": "short quote (max 60 chars) from the highlighted text"
}}

Category definitions:
- **issue**: A legal problem, missing clause, or risk introduced in the new version
- **suggestion**: Recommendation for improvement
- **strength**: Something that improved or is legally strong in the new version
- **grammar**: Grammar, spelling, or formatting issue
- **weak_argument**: An argument that weakened compared to the original
- **change**: A neutral or notable change worth flagging

Guidelines:
- Focus on legally significant changes
- The text_span MUST be an exact substring of the NEW document (verbatim, case-sensitive)
- Keep text_span to 1-3 sentences maximum
- Produce 5-10 annotations (quality over quantity)
- Prioritize: legal issues > strengths > suggestions > changes > grammar

Return ONLY the JSON array, no markdown, no explanation."""


@dataclass
class Annotation:
    id: str
    category: str
    severity: str
    text_span: str
    span_start: int
    span_end: int
    note: str
    quote: str


def _find_span_offsets(text: str, span: str) -> tuple[int, int] | None:
    """Find the character offsets of a span in the text."""
    idx = text.find(span)
    if idx >= 0:
        return (idx, idx + len(span))
    # Try case-insensitive
    lower_idx = text.lower().find(span.lower())
    if lower_idx >= 0:
        return (lower_idx, lower_idx + len(span))
    return None


def generate_annotations(
    original_text: str,
    new_text: str,
    api_key: str = "",
) -> list[dict]:
    """Compare two document versions and produce annotations for the new one.

    Returns a list of annotation dicts ready to store as JSON.
    """
    key = api_key or settings.anthropic_api_key
    if not key:
        return []

    client = Anthropic(api_key=key)

    # Truncate very long documents to fit context
    max_chars = 15000
    orig_truncated = original_text[:max_chars]
    new_truncated = new_text[:max_chars]

    prompt = ANNOTATION_PROMPT.format(
        original_text=orig_truncated,
        new_text=new_truncated,
    )

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = response.content[0].text

        # Extract JSON array from response
        json_match = re.search(r"\[[\s\S]*\]", response_text)
        if not json_match:
            return []

        raw_annotations = json.loads(json_match.group())
    except Exception:
        return []

    # Process and validate annotations
    annotations: list[dict] = []
    for i, raw in enumerate(raw_annotations):
        text_span = raw.get("text_span", "")
        if not text_span:
            continue

        offsets = _find_span_offsets(new_text, text_span)
        if not offsets:
            # Span not found in text — skip this annotation
            continue

        annotations.append({
            "id": f"ann-{i + 1}",
            "category": raw.get("category", "change"),
            "severity": raw.get("severity", "medium"),
            "text_span": text_span,
            "span_start": offsets[0],
            "span_end": offsets[1],
            "note": raw.get("note", ""),
            "quote": raw.get("quote", text_span[:60]),
        })

    # Sort by position in document
    annotations.sort(key=lambda a: a["span_start"])

    # Re-number IDs after sorting
    for i, ann in enumerate(annotations):
        ann["id"] = f"ann-{i + 1}"

    return annotations
