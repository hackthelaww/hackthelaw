"""AI case summary generator — builds a structured summary from extracted entities."""

from __future__ import annotations

import json
import re

from app.db import read_query


SUMMARY_PROMPT = """You are a legal analyst. Given the extracted entities and relationships from a legal case, produce a structured JSON summary.

Return ONLY valid JSON with these sections:
{
  "parties": [{"name": "...", "role": "...", "description": "..."}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "...", "source_doc": "..."}],
  "obligations": [{"party": "...", "obligation": "...", "deadline": "...", "status": "pending"}],
  "risks": [{"description": "...", "severity": "low|medium|high|critical", "source": "..."}],
  "key_facts": ["fact 1", "fact 2"],
  "monetary_amounts": [{"amount": 0, "currency": "USD", "context": "..."}],
  "jurisdictional_info": {"jurisdiction": "...", "court": "...", "governing_law": "..."}
}

Rules:
- Only include information that is explicitly present in the entities.
- Do NOT invent or hallucinate facts.
- If a section has no data, use an empty array or empty object.
- Return ONLY the JSON object, no markdown, no explanation."""


async def generate_case_summary(
    matter_id: str,
    provider: str = "anthropic",
    model_name: str = "claude-haiku-4-5-20251001",
    api_key: str = "",
) -> dict:
    """Generate a structured case summary from all entities in the graph."""

    # Fetch all entities for this matter
    entities = await read_query(
        """
        MATCH (e)-[:BELONGS_TO]->(:Matter {id: $mid})
        WHERE e:Entity OR any(l IN labels(e) WHERE l <> 'Entity')
        RETURN e.name AS name, e.entity_type AS type,
               e.description AS description, e {.*} AS props
        LIMIT 500
        """,
        {"mid": matter_id},
    )

    # Fetch all relations between entities in this matter
    relations = await read_query(
        """
        MATCH (a)-[r]->(b)
        WHERE (a)-[:BELONGS_TO]->(:Matter {id: $mid})
          AND (b)-[:BELONGS_TO]->(:Matter {id: $mid})
          AND type(r) <> 'BELONGS_TO'
        RETURN a.name AS from_name, type(r) AS rel_type, b.name AS to_name
        LIMIT 500
        """,
        {"mid": matter_id},
    )

    if not entities:
        return {
            "parties": [], "timeline": [], "obligations": [], "risks": [],
            "key_facts": ["No entities extracted yet."],
            "monetary_amounts": [], "jurisdictional_info": {},
        }

    entity_text = json.dumps([
        {"name": e["name"], "type": e["type"], "description": e.get("description", "")}
        for e in entities if e.get("name")
    ], indent=2)

    relation_text = json.dumps([
        {"from": r["from_name"], "relation": r["rel_type"], "to": r["to_name"]}
        for r in relations if r.get("from_name")
    ], indent=2)

    prompt = f"Entities:\n{entity_text}\n\nRelations:\n{relation_text}\n\nGenerate the structured summary JSON."

    # Build and run the model
    from app.ingest.extraction_agent import build_model

    model = build_model(provider, model_name, api_key)

    from strands import Agent
    agent = Agent(model=model, system_prompt=SUMMARY_PROMPT, tools=[])
    result = agent(prompt)

    response_text = str(result)

    # Extract JSON from the response
    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if json_match:
        try:
            summary = json.loads(json_match.group())
        except json.JSONDecodeError:
            summary = {"key_facts": [response_text], "parse_error": True}
    else:
        summary = {"key_facts": [response_text], "parse_error": True}

    return summary
