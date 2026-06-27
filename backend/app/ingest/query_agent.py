"""Strands query agent — answers complex questions about a case by querying
the Neo4j knowledge graph and Supabase relational database.

Read-only: this agent never writes to any database.
"""

import json

from strands import Agent, tool

from app.db import read_query_sync
from app.supabase_client import get_supabase, get_case_uuid_by_slug

# ---------------------------------------------------------------------------
# Run-scoped context (set before each agent invocation)
# ---------------------------------------------------------------------------

_ctx: dict = {}


# ---------------------------------------------------------------------------
# Tools — all read-only, scoped to _ctx["matter_id"]
# ---------------------------------------------------------------------------


@tool
def search_entities(
    entity_type: str = "",
    name_contains: str = "",
    keyword: str = "",
    limit: int = 25,
) -> str:
    """Search entities in the knowledge graph for this case.

    Use this to find people, organizations, clauses, obligations, risks,
    dates, monetary amounts, or any other extracted fact.

    Args:
        entity_type: Filter by entity type (e.g. "Person", "Organization",
                     "RiskFactor", "Obligation", "MonetaryAmount", "Deadline",
                     "Clause", "Statute", "Court"). Leave empty to search all.
        name_contains: Filter entities whose name contains this substring
                       (case-insensitive).
        keyword: Search across name, description, and text fields
                 (case-insensitive).
        limit: Maximum results to return (default 25).
    """
    try:
        where_clauses = ["e.matter_id = $mid"]
        params: dict = {"mid": _ctx["matter_id"], "limit": limit}

        if entity_type:
            where_clauses.append("toLower(e.entity_type) = toLower($etype)")
            params["etype"] = entity_type

        if name_contains:
            where_clauses.append("toLower(e.name) CONTAINS toLower($nameFilter)")
            params["nameFilter"] = name_contains

        if keyword:
            where_clauses.append(
                "(toLower(coalesce(e.name,'')) + ' ' + toLower(coalesce(e.description,'')) "
                "+ ' ' + toLower(coalesce(e.text,''))) CONTAINS toLower($kw)"
            )
            params["kw"] = keyword

        where = " AND ".join(where_clauses)

        records = read_query_sync(
            f"""
            MATCH (e:Entity)-[:BELONGS_TO]->(:Matter {{id: $mid}})
            WHERE {where}
            RETURN e.name AS name, e.entity_type AS type,
                   coalesce(e.description, '') AS description,
                   coalesce(e.text, '') AS text,
                   e.role AS role, e.date AS date, e.amount AS amount,
                   e.due_date AS due_date, e.risk_level AS risk_level,
                   e.document_id AS document_id
            ORDER BY e.extracted_at DESC
            LIMIT $limit
            """,
            params,
        )

        if not records:
            return f"No entities found matching your criteria in this case."

        lines = []
        for r in records:
            parts = [f"[{r['type']}] {r['name']}"]
            if r.get("description"):
                parts.append(f"  Description: {r['description'][:300]}")
            if r.get("text"):
                parts.append(f"  Text: {r['text'][:200]}")
            if r.get("role"):
                parts.append(f"  Role: {r['role']}")
            if r.get("date"):
                parts.append(f"  Date: {r['date']}")
            if r.get("amount"):
                parts.append(f"  Amount: {r['amount']}")
            if r.get("due_date"):
                parts.append(f"  Due date: {r['due_date']}")
            if r.get("risk_level"):
                parts.append(f"  Risk level: {r['risk_level']}")
            lines.append("\n".join(parts))

        return f"Found {len(records)} entities:\n\n" + "\n\n".join(lines)
    except Exception as e:
        return f"Error searching entities: {e}"


@tool
def get_entity_relationships(
    entity_name: str,
    relationship_type: str = "",
    direction: str = "both",
) -> str:
    """Find all relationships connected to a specific entity.

    Use this for questions like "Who represents X?", "What is X party to?",
    or "What obligations does X have?".

    Args:
        entity_name: The name of the entity to look up (case-insensitive match).
        relationship_type: Optional filter for a specific relationship type
                          (e.g. "REPRESENTS", "PARTY_TO", "OBLIGATED_TO_PAY",
                          "GOVERNS", "REFERENCES", "DRAFTED", "AUTHORED").
                          Leave empty for all relationships.
        direction: "outgoing", "incoming", or "both" (default "both").
    """
    try:
        mid = _ctx["matter_id"]

        # Build the relationship pattern based on direction
        if direction == "outgoing":
            rel_pattern = "(a)-[r]->(b)"
        elif direction == "incoming":
            rel_pattern = "(b)-[r]->(a)"
        else:
            # For "both", we do two queries and combine
            rel_pattern = None

        results = []

        if rel_pattern is None:
            # Both directions
            for pattern, label in [("(a)-[r]->(b)", "outgoing"), ("(b)-[r]->(a)", "incoming")]:
                params: dict = {"mid": mid, "name": entity_name}
                rel_filter = ""
                if relationship_type:
                    rel_filter = f" AND type(r) = $relType"
                    params["relType"] = relationship_type.upper().replace(" ", "_")

                records = read_query_sync(
                    f"""
                    MATCH (a:Entity)-[:BELONGS_TO]->(:Matter {{id: $mid}})
                    WHERE toLower(a.name) = toLower($name)
                    MATCH {pattern}
                    WHERE type(r) <> 'BELONGS_TO' AND type(r) <> 'MENTIONS'{rel_filter}
                    RETURN a.name AS from_name, type(r) AS rel_type, b.name AS to_name,
                           b.entity_type AS to_type,
                           coalesce(b.description, '') AS to_desc
                    """,
                    params,
                )
                for rec in records:
                    if label == "outgoing":
                        results.append(f"  {rec['from_name']} -[{rec['rel_type']}]-> {rec['to_name']} ({rec['to_type']})")
                    else:
                        results.append(f"  {rec['to_name']} ({rec['to_type']}) -[{rec['rel_type']}]-> {rec['from_name']}")
                    if rec.get("to_desc"):
                        results.append(f"    {rec['to_desc'][:200]}")
        else:
            params = {"mid": mid, "name": entity_name}
            rel_filter = ""
            if relationship_type:
                rel_filter = f" AND type(r) = $relType"
                params["relType"] = relationship_type.upper().replace(" ", "_")

            records = read_query_sync(
                f"""
                MATCH (a:Entity)-[:BELONGS_TO]->(:Matter {{id: $mid}})
                WHERE toLower(a.name) = toLower($name)
                MATCH {rel_pattern}
                WHERE type(r) <> 'BELONGS_TO' AND type(r) <> 'MENTIONS'{rel_filter}
                RETURN a.name AS from_name, type(r) AS rel_type, b.name AS to_name,
                       b.entity_type AS to_type,
                       coalesce(b.description, '') AS to_desc
                """,
                params,
            )
            for rec in records:
                results.append(f"  {rec['from_name']} -[{rec['rel_type']}]-> {rec['to_name']} ({rec['to_type']})")
                if rec.get("to_desc"):
                    results.append(f"    {rec['to_desc'][:200]}")

        if not results:
            return f"No relationships found for entity '{entity_name}'."

        return f"Relationships for '{entity_name}':\n" + "\n".join(results)
    except Exception as e:
        return f"Error querying relationships: {e}"


@tool
def query_case_events(
    category: str = "",
    severity: str = "",
    unresolved_only: bool = False,
) -> str:
    """Query case intelligence events — anomalies, contradictions, positive findings.

    Use this for questions about contradictions, risks, what's going well,
    or what needs attention.

    Args:
        category: Filter by "positive", "routine", or "anomaly". Empty for all.
        severity: Filter by "low", "medium", or "high". Empty for all.
        unresolved_only: If true, only return unresolved anomalies.
    """
    try:
        case_uuid = get_case_uuid_by_slug(_ctx["matter_id"])
        if not case_uuid:
            return "Case not found in Supabase — event data is not available for this matter."

        query = get_supabase().table("case_events").select("*").eq("case_id", case_uuid)

        if category:
            query = query.eq("category", category)
        if severity:
            query = query.eq("severity", severity)
        if unresolved_only:
            query = query.is_("resolution", "null")

        result = query.order("created_at", desc=True).limit(30).execute()
        events = result.data or []

        if not events:
            filter_desc = ""
            if category:
                filter_desc += f" with category='{category}'"
            if severity:
                filter_desc += f" with severity='{severity}'"
            return f"No case events found{filter_desc}."

        lines = []
        for ev in events:
            status = f" [RESOLVED: {ev.get('resolution')}]" if ev.get("resolution") else " [UNRESOLVED]" if ev["category"] == "anomaly" else ""
            entities = ", ".join(ev.get("entities_involved", []))
            docs = ", ".join(ev.get("source_documents", []))
            lines.append(
                f"[{ev['category'].upper()}] {ev['title']} (severity: {ev['severity']}){status}\n"
                f"  {ev['description']}\n"
                f"  Entities: {entities or 'N/A'}\n"
                f"  Source docs: {docs or 'N/A'}"
            )

        return f"Found {len(events)} events:\n\n" + "\n\n".join(lines)
    except Exception as e:
        return f"Error querying case events: {e}"


@tool
def query_case_documents(
    filename_contains: str = "",
    uploaded_by: str = "",
    most_recent: int = 0,
) -> str:
    """Query document upload history and metadata for this case.

    Use this for questions about when documents were uploaded, by whom,
    how many documents exist, or to find specific files.

    Args:
        filename_contains: Filter by filename substring (case-insensitive).
        uploaded_by: Filter by uploader email substring.
        most_recent: If > 0, return only the N most recently uploaded documents.
    """
    try:
        case_uuid = get_case_uuid_by_slug(_ctx["matter_id"])
        if not case_uuid:
            return "Case not found in Supabase — document metadata is not available."

        query = (
            get_supabase()
            .table("case_documents")
            .select("id, filename, uploaded_at, uploaded_by_email, source, extraction_status, similarity_status, char_count, neo4j_document_id")
            .eq("case_id", case_uuid)
            .order("uploaded_at", desc=True)
        )

        if filename_contains:
            query = query.ilike("filename", f"%{filename_contains}%")
        if uploaded_by:
            query = query.ilike("uploaded_by_email", f"%{uploaded_by}%")

        limit = most_recent if most_recent > 0 else 30
        query = query.limit(limit)

        result = query.execute()
        docs = result.data or []

        if not docs:
            return "No documents found matching your criteria."

        lines = []
        for d in docs:
            lines.append(
                f"• {d['filename']}\n"
                f"  Uploaded: {d.get('uploaded_at', 'unknown')}\n"
                f"  By: {d.get('uploaded_by_email', 'unknown')}\n"
                f"  Source: {d.get('source', 'unknown')} | "
                f"Extraction: {d.get('extraction_status', 'unknown')} | "
                f"Similarity: {d.get('similarity_status', 'N/A')} | "
                f"Size: {d.get('char_count', '?')} chars"
            )

        return f"Found {len(docs)} documents:\n\n" + "\n\n".join(lines)
    except Exception as e:
        return f"Error querying documents: {e}"


@tool
def get_document_content(document_title: str) -> str:
    """Retrieve the text content of a specific document by title or filename.

    Use this when you need to read the actual text of a document to answer
    a question about its contents.

    Args:
        document_title: The title or filename of the document to retrieve.
    """
    try:
        mid = _ctx["matter_id"]
        records = read_query_sync(
            """
            MATCH (d:Document)-[:BELONGS_TO]->(:Matter {id: $mid})
            WHERE toLower(d.title) CONTAINS toLower($search)
               OR toLower(d.filename) CONTAINS toLower($search)
            OPTIONAL MATCH (d)-[:HAS_VERSION]->(v:Version)
            RETURN d.title AS title, d.filename AS filename,
                   v.content AS content
            ORDER BY v.createdAt DESC
            LIMIT 1
            """,
            {"mid": mid, "search": document_title},
        )

        if not records:
            return f"No document found matching '{document_title}' in this case."

        rec = records[0]
        content = rec.get("content", "")
        if not content:
            return f"Document '{rec.get('title') or rec.get('filename')}' found but has no text content."

        # Cap at 5000 chars to stay within context limits
        truncated = content[:5000]
        suffix = "... [truncated]" if len(content) > 5000 else ""

        return (
            f"Document: {rec.get('title') or rec.get('filename')}\n"
            f"Content ({len(content)} chars total):\n\n{truncated}{suffix}"
        )
    except Exception as e:
        return f"Error retrieving document content: {e}"


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Quinn, a legal case intelligence assistant. The user is a LAWYER or PARTNER reviewing this case — they are NOT a party to the case. Never confuse the lawyer with the claimant, defendant, witness, or any person mentioned in the case documents.

When describing case facts, always refer to parties by name (e.g. "Mitchell informed her manager..." NOT "you informed your manager..."). Use "you" ONLY when talking about the lawyer's own actions within the tool (e.g. "you uploaded this document", "you may want to review...").

You have 5 tools:

1. **search_entities** — Find people, organizations, clauses, obligations, risks, dates, amounts, and any other extracted entities in the knowledge graph. Use this for broad searches.

2. **get_entity_relationships** — Traverse the graph to see how entities connect (who represents whom, what clause governs what, who is party to what). Use this for relationship questions.

3. **query_case_events** — Access case intelligence: anomalies (contradictions), positive findings, and their resolution status. Use this for risk/contradiction questions.

4. **query_case_documents** — Check document upload history, who uploaded what and when. Use this for document provenance questions.

5. **get_document_content** — Read the actual text of a specific document. Use this when you need to quote or analyze document content.

Rules:
- ALWAYS use your tools to answer questions. Never answer from general knowledge.
- If a question requires combining data from multiple sources, call multiple tools.
- If your tools return no relevant data, say so clearly — do not fabricate answers.
- Be concise: 2-5 sentences for simple questions, more for complex analysis.
- When citing information, mention the source entity type and name.
- CRITICAL: The user is the lawyer, not a case party. Refer to case parties in the third person by name. Never say "you were dismissed" or "your employer" — say "Mitchell was dismissed" or "TechSolutions Ltd".
- For relationship questions ("who represents the claimant?"), use get_entity_relationships.
- For broad searches ("what are the risks?"), use search_entities with type filters.
- For timeline/contradiction questions, use query_case_events.
- For document history questions, use query_case_documents.
- For "what does document X say about Y?", use get_document_content.
"""


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

async def run_query_agent(
    question: str,
    matter_id: str,
    provider: str = "anthropic",
    model_name: str = "claude-sonnet-4-20250514",
    api_key: str = "",
    api_endpoint: str = "",
) -> dict:
    """Run the query agent to answer a question about a specific case."""
    global _ctx
    _ctx = {"matter_id": matter_id}

    from app.ingest.extraction_agent import build_model

    model = build_model(provider, model_name, api_key, api_endpoint)
    agent = Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[
            search_entities,
            get_entity_relationships,
            query_case_events,
            query_case_documents,
            get_document_content,
        ],
    )

    result = agent(question)
    answer_text = str(result)

    return {
        "answer": answer_text,
        "citations": [],
        "groundingEmpty": False,
    }
