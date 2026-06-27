"""Case Intelligence Agent — classifies changes and detects inconsistencies.

Runs after each document extraction. Compares new entities against existing
ones to classify every change as positive, routine, or anomaly.

Uses Anthropic Claude to detect semantic contradictions that simple
property comparison would miss.
"""

from __future__ import annotations

import json
import re

from anthropic import Anthropic

from app.config import settings
from app.db import read_query
from app.supabase_client import get_supabase, get_case_uuid_by_slug


INTELLIGENCE_PROMPT = """You are a legal case analyst reviewing new evidence that was just added to a case.

EXISTING CASE FACTS (from previous documents):
{existing_facts}

NEW FACTS (just extracted from the latest document: "{new_document}"):
{new_facts}

Analyze the new facts against the existing ones and classify each significant change.

Return ONLY a valid JSON array. Each item must have:
{{
  "category": "positive" | "routine" | "anomaly",
  "title": "short title (max 80 chars)",
  "description": "1-2 sentence explanation",
  "severity": "low" | "medium" | "high",
  "entities_involved": ["entity names involved"],
  "reasoning": "why this classification"
}}

Classification rules:
- **positive**: New evidence that STRENGTHENS the case. A new witness confirming a date, a document supporting the client's claim, new details that help build the argument.
- **routine**: Information with no legal significance. Internal admin emails, formatting changes, duplicate information already known.
- **anomaly**: CONTRADICTIONS between documents. Different dates for the same event, conflicting statements about the same fact, impossible timelines, role contradictions. These need human review.

For anomalies specifically, be precise about WHAT contradicts WHAT:
- "Doc A says pregnancy disclosed on 15 Jan, but Doc B says 20 Jan"
- "Performance review says 'exceeds expectations' but dismissal letter cites 'poor performance'"

Produce 3-8 events. Focus on the most legally significant changes.
Do NOT flag as anomaly if the new info simply adds detail to existing facts.
Only flag anomalies for genuine CONTRADICTIONS.

Return ONLY the JSON array."""


async def run_case_intelligence(
    matter_id: str,
    new_document_title: str,
    new_document_id: str,
) -> list[dict]:
    """Analyze new entities against existing ones, classify changes.

    Returns list of CaseEvent dicts ready to insert into Supabase.
    """
    if not settings.anthropic_api_key:
        return []

    # Fetch all entities grouped by document
    all_entities = await read_query(
        """
        MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {id: $mid})
        OPTIONAL MATCH (d:Document {id: e.document_id})
        RETURN e.name AS name, e.entity_type AS type,
               e.description AS description, e.document_id AS doc_id,
               d.title AS doc_title, d.filename AS doc_filename,
               e.extracted_at AS extracted_at,
               e {.*} AS properties
        ORDER BY e.extracted_at
        """,
        {"mid": matter_id},
    )

    if not all_entities:
        return []

    # Split into existing vs new entities
    existing = []
    new = []
    for e in all_entities:
        if e.get("doc_id") == new_document_id:
            new.append(e)
        else:
            existing.append(e)

    if not new:
        return []

    # If this is the first document, generate a positive "case established" event
    if not existing:
        return [{
            "category": "positive",
            "title": f"Case established from {new_document_title}",
            "description": f"Initial document uploaded with {len(new)} entities extracted. Case timeline and key parties identified.",
            "severity": "low",
            "entities_involved": [e["name"] for e in new[:5]],
            "source_documents": [new_document_title],
        }]

    # Format facts for LLM
    def format_facts(entities: list[dict]) -> str:
        lines = []
        for e in entities:
            doc = e.get("doc_title") or e.get("doc_filename") or "unknown"
            desc = e.get("description") or ""
            props = e.get("properties", {})
            # Extract key properties
            date = props.get("date", "")
            amount = props.get("amount", "")
            role = props.get("role", "")
            extra = []
            if date:
                extra.append(f"date={date}")
            if amount:
                extra.append(f"amount={amount}")
            if role:
                extra.append(f"role={role}")
            extra_str = f" [{', '.join(extra)}]" if extra else ""
            lines.append(f"- [{e['type']}] {e['name']}: {desc}{extra_str} (from: {doc})")
        return "\n".join(lines) if lines else "No entities yet."

    existing_text = format_facts(existing[:100])  # Cap for context window
    new_text = format_facts(new[:50])

    prompt = INTELLIGENCE_PROMPT.format(
        existing_facts=existing_text,
        new_facts=new_text,
        new_document=new_document_title,
    )

    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = response.content[0].text
        json_match = re.search(r"\[[\s\S]*\]", response_text)
        if not json_match:
            return []

        raw_events = json.loads(json_match.group())
    except Exception:
        return []

    # Process and validate events
    events = []
    for raw in raw_events:
        category = raw.get("category", "routine")
        if category not in ("positive", "routine", "anomaly"):
            category = "routine"

        events.append({
            "category": category,
            "title": raw.get("title", "")[:200],
            "description": raw.get("description", ""),
            "severity": raw.get("severity", "low") if category == "anomaly" else "low",
            "entities_involved": raw.get("entities_involved", []),
            "source_documents": [new_document_title],
        })

    return events


async def store_case_events(
    matter_id: str,
    events: list[dict],
    event_date: str | None = None,
) -> int:
    """Store classified events in Supabase case_events table.

    Args:
        event_date: Optional ISO date string to use as created_at (for simulated dates).
    """
    case_uuid = get_case_uuid_by_slug(matter_id)
    if not case_uuid or not events:
        return 0

    sb = get_supabase()
    stored = 0
    for event in events:
        try:
            row: dict = {
                "case_id": case_uuid,
                "category": event["category"],
                "title": event["title"],
                "description": event.get("description", ""),
                "severity": event.get("severity", "low"),
                "entities_involved": event.get("entities_involved", []),
                "source_documents": event.get("source_documents", []),
            }
            if event_date:
                row["created_at"] = f"{event_date}T12:00:00+00:00"
            sb.table("case_events").insert(row).execute()
            stored += 1
        except Exception:
            pass

    return stored
