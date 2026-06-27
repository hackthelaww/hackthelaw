"""Strands agent that extracts structured information from legal documents.

Dynamic extraction: the agent decides what types of entities exist and what
properties they have. Two generic tools:

  - add_entity(type, name, properties) → create any kind of node
  - add_relation(from_entity, to_entity, relation_type, properties) → link two nodes
"""

import re
import json
import uuid
import time

from strands import Agent, tool

from app.db import write_query, write_query_sync
from app.embeddings import embed_text_sync

# ---------------------------------------------------------------------------
# Run-scoped state (set before each agent invocation)
# ---------------------------------------------------------------------------

_ctx: dict = {}


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _make_id(entity_type: str, name: str) -> str:
    return f"{_ctx['matter_id']}::{_slugify(entity_type)}::{_slugify(name)}"


# ---------------------------------------------------------------------------
# Two generic tools — the agent decides what to extract
# ---------------------------------------------------------------------------

@tool
def add_entity(entity_type: str, name: str, properties: dict) -> str:
    """Add any entity found in the document to the knowledge graph.

    You decide the entity_type based on what you find. Common types include
    (but are NOT limited to):
      Person, Organization, LawFirm, Court, Judge,
      Clause, Section, Article, Provision,
      Deadline, Date, TimeConstraint,
      MonetaryAmount, PaymentObligation,
      Jurisdiction, GoverningLaw,
      Obligation, Right, Restriction, Prohibition,
      Definition, Term,
      RiskFactor, Liability, Indemnity,
      CasePrecedent, LegalReference, Statute,
      Condition, Trigger, Event,
      Exhibit, Attachment, Schedule,
      Note, Observation, KeyFinding

    You can invent new types if none of these fit — the graph is flexible.

    Args:
        entity_type: The type/category of this entity (e.g. "Person", "MonetaryAmount", "RiskFactor").
                     Use PascalCase. Be specific — "PaymentObligation" is better than "Thing".
        name: A short, unique name/label for this entity (e.g. "Baker Hostetler LLP",
              "Settlement Amount", "30-day response window", "Section 42 — Release").
        properties: A dictionary of all relevant properties. Include everything you can extract.
                    Common keys: role, amount, currency, date, due_date, description, text,
                    ref, article_number, risk_level, source_paragraph, verbatim_quote, etc.
                    Always include a "description" or "text" key with substantive content.
    """
    entity_id = _make_id(entity_type, name)
    label = entity_type

    # Build properties dict
    props = {
        "id": entity_id,
        "name": name,
        "entity_type": entity_type,
        "matter_id": _ctx["matter_id"],
        "document_id": _ctx["document_id"],
        "extracted_at": _now_ms(),
        **{k: v for k, v in properties.items() if v is not None},
    }

    # Neo4j doesn't allow dicts/lists as properties — serialize them
    clean_props = {}
    for k, v in props.items():
        if isinstance(v, (dict, list)):
            clean_props[k] = json.dumps(v)
        else:
            clean_props[k] = v

    # Real semantic embedding — best available text, falling back to the entity
    # name. None (no PERPLEXITY_API_KEY configured) is fine: the entity is just
    # not yet semantically searchable, extraction itself never fails over this.
    embed_source = properties.get("text") or properties.get("description") or name
    embedding = embed_text_sync(f"{name}\n\n{embed_source}")
    if embedding is not None:
        clean_props["embedding"] = embedding

    set_parts = ", ".join(f"n.{k} = ${k}" for k in clean_props)

    cypher = f"""
        MERGE (n:Entity:{label} {{id: $id}})
        SET {set_parts}
        WITH n
        MATCH (m:Matter {{id: $matter_id}})
        MERGE (n)-[:BELONGS_TO]->(m)
        WITH n
        MATCH (e:Episode {{id: $eid}})
        MERGE (e)-[:MENTIONS]->(n)
    """

    write_query_sync(cypher, {**clean_props, "eid": _ctx["episode_id"]})

    _ctx["entities"].append({
        "id": entity_id,
        "type": entity_type,
        "name": name,
        "properties": properties,
    })
    return f"Added {entity_type}: {name}"


@tool
def set_matter_title(title: str, description: str = "") -> str:
    """Set a concise, human-readable title for this legal matter/case.

    Call this FIRST, before extracting entities. Read the document and create
    a short title that a lawyer would use to identify this case at a glance.

    Args:
        title: A concise title (e.g. "Stanford Receivership Settlement — Independent Bank",
               "Post Office Horizon IT Inquiry — Paula Vennells Witness Statement",
               "CloudVendor Data Processing Agreement Review").
               Keep it under 80 characters. Include key parties or subject matter.
        description: A one-sentence summary of what this document is about.
    """
    write_query_sync(
        """
        MATCH (m:Matter {id: $mid})
        SET m.name = $title, m.description = $description
        """,
        {"mid": _ctx["matter_id"], "title": title, "description": description},
    )
    _ctx["matter_title"] = title
    return f"Matter title set to: {title}"


@tool
def add_relation(from_name: str, to_name: str, relation_type: str, properties: dict | None = None) -> str:
    """Create a relationship between two entities that you have already added.

    Args:
        from_name: The name of the source entity (must match a previously added entity's name)
        to_name: The name of the target entity (must match a previously added entity's name)
        relation_type: The relationship type in UPPER_SNAKE_CASE (e.g. "REPRESENTS",
                       "PARTY_TO", "SUBJECT_TO", "DEFINES", "REFERENCES", "OBLIGATED_TO_PAY",
                       "GOVERNED_BY", "MODIFIES", "RESTRICTS", "TRIGGERS", "PRECEDES").
        properties: Optional dictionary of relationship properties
    """
    from_entity = next((e for e in _ctx["entities"] if e["name"] == from_name), None)
    to_entity = next((e for e in _ctx["entities"] if e["name"] == to_name), None)

    if not from_entity:
        return f"Entity not found: '{from_name}'. Add it first with add_entity."
    if not to_entity:
        return f"Entity not found: '{to_name}'. Add it first with add_entity."

    rel_type = relation_type.upper().replace(" ", "_")
    props = properties or {}

    clean_props = {}
    for k, v in props.items():
        if isinstance(v, (dict, list)):
            clean_props[k] = json.dumps(v)
        elif v is not None:
            clean_props[k] = v

    if clean_props:
        set_parts = ", ".join(f"r.{k} = ${k}" for k in clean_props)
        cypher = f"""
            MATCH (a:Entity {{id: $from_id}})
            MATCH (b:Entity {{id: $to_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET {set_parts}
        """
        params = {"from_id": from_entity["id"], "to_id": to_entity["id"], **clean_props}
    else:
        cypher = f"""
            MATCH (a:Entity {{id: $from_id}})
            MATCH (b:Entity {{id: $to_id}})
            MERGE (a)-[r:{rel_type}]->(b)
        """
        params = {"from_id": from_entity["id"], "to_id": to_entity["id"]}

    write_query_sync(cypher, params)

    _ctx["relations"].append({
        "from": from_name,
        "to": to_name,
        "type": relation_type,
        "properties": props,
    })
    return f"Added relation: {from_name} -[{relation_type}]-> {to_name}"


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a legal document analyst building a knowledge graph — a "second brain" for a lawyer.

Your job is to read a legal document and extract EVERYTHING useful into a structured knowledge graph.
You have three tools:

1. **set_matter_title(title, description)** — CALL THIS FIRST. Give the case/matter a concise,
   human-readable title based on the document content. Example: "Post Office Horizon IT Inquiry —
   Vennells Witness Statement". Keep it under 80 characters.

2. **add_entity(type, name, properties)** — Create a node for anything meaningful you find.
   You choose the entity type. Be creative and thorough. Extract:
   - People, organizations, law firms, courts, judges
   - Clauses, sections, articles — with their FULL verbatim text
   - Dates, deadlines, time constraints
   - Monetary amounts, payment obligations, settlement amounts
   - Legal obligations, rights, restrictions, prohibitions
   - Definitions of key terms
   - Jurisdictions, governing law, venue
   - Risk factors, liabilities, indemnities
   - Case references, statutes, legal precedents
   - Conditions, triggers, events
   - Any other structured information a lawyer would want to recall later

3. **add_relation(from_name, to_name, relation_type, properties)** — Connect entities.
   After adding entities, link them to show HOW they relate.

Rules:
- Be EXHAUSTIVE — extract every piece of structured information. This is a second brain;
  anything not extracted is lost.
- For clauses/sections: always include the VERBATIM text in properties, never summarize.
- Include a "description" property on every entity with a human-readable explanation.
- For amounts: include "amount" and "currency" as separate properties.
- For dates: use ISO format (YYYY-MM-DD) when the exact date is known.
- Create relations between entities AFTER adding them. Map the full web of relationships.
- Invent entity types and relation types as needed — the graph is flexible.
- NEVER ask questions or request clarification. Extract whatever you can from the text provided,
  even if it's short, informal, or doesn't look like a traditional legal document. Emails,
  internal memos, performance reviews, and notes are all valuable evidence in a case.
- ALWAYS call your tools. Even a 2-line email has parties, dates, and facts worth extracting.
"""


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------

def build_model(provider: str, model_name: str, api_key: str = "", api_endpoint: str = ""):
    if provider == "anthropic":
        from strands.models import AnthropicModel
        key = api_key
        if not key:
            from app.config import settings
            key = settings.anthropic_api_key
        if not key:
            raise ValueError("Anthropic API key required. Set ANTHROPIC_API_KEY in .env.development or pass api_key.")
        return AnthropicModel(
            model_id=model_name,
            max_tokens=16000,
            client_args={"api_key": key},
        )
    elif provider == "openai":
        from strands.models import OpenAIModel
        kwargs = {"model_id": model_name}
        if api_key:
            kwargs["api_key"] = api_key
        if api_endpoint:
            kwargs["client_args"] = {"base_url": api_endpoint}
        return OpenAIModel(**kwargs)
    elif provider == "ollama":
        from strands.models import OllamaModel
        kwargs = {}
        if api_endpoint:
            kwargs["host"] = api_endpoint
        if model_name:
            kwargs["model_id"] = model_name
        return OllamaModel(**kwargs)
    else:
        raise ValueError(f"Unknown provider: {provider}. Supported: anthropic, openai, ollama")


# ---------------------------------------------------------------------------
# Run extraction
# ---------------------------------------------------------------------------

async def run_extraction(
    document_text: str,
    matter_id: str,
    document_id: str,
    provider: str = "anthropic",
    model_name: str = "claude-sonnet-4-20250514",
    api_key: str = "",
    api_endpoint: str = "",
) -> dict:
    """Run the extraction agent on document text. Returns entities and relations."""
    global _ctx

    # Create episode
    episode_id = str(uuid.uuid4())
    await write_query(
        """
        CREATE (e:Episode {
            id: $id, kind: 'AGENT_ACTION',
            label: $label, payloadRef: $ref, createdAt: $ts
        })
        """,
        {
            "id": episode_id,
            "label": f"Document extraction: {document_id}",
            "ref": document_id,
            "ts": _now_ms(),
        },
    )

    _ctx = {
        "matter_id": matter_id,
        "document_id": document_id,
        "episode_id": episode_id,
        "entities": [],
        "relations": [],
    }

    model = build_model(provider, model_name, api_key, api_endpoint)
    agent = Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[set_matter_title, add_entity, add_relation],
    )

    prompt = f"""Analyze this legal document thoroughly. Extract every entity (people, orgs, clauses, amounts, dates, obligations, risks, etc.) and map the relationships between them.

---

{document_text}"""

    agent(prompt)

    return {
        "episode_id": episode_id,
        "matter_title": _ctx.get("matter_title"),
        "entities": _ctx["entities"],
        "relations": _ctx["relations"],
    }
