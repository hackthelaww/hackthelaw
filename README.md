# Quinn

A supervision layer for human–AI legal teams. Quinn triages AI review output by
confidence × risk × consequence, lets a partner inspect the real reasoning and
real sources behind each finding, and records every decision — and every
change of belief over time — in a bi-temporal case-memory graph.

Everything in this app is live: real GDPR text from EUR-Lex, real model calls
to Perplexity's Agent API, real graph writes at the moment work happens. The
only authored content is the firm's own playbook (`data/playbook.json`) — the
firm's standards, not legal advice or case material. If an external API can't
be reached, the UI shows the real error; it never falls back to fake data.

## Stack

- Next.js (App Router) + TypeScript, Tailwind + shadcn/ui
- Neo4j (Aura free tier) — the bi-temporal case-memory graph
- Perplexity Agent API (OpenAI SDK pointed at `https://api.perplexity.ai/v1`,
  `responses.create`) for clause analysis, an optional research sub-agent
  (`web_search` + `fetch_url`), and the chat layer
- EU Publications Office / EUR-Lex for live GDPR text

## Setup

```bash
cp .env.example .env.local
# fill in PERPLEXITY_API_KEY, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
npm install
npm run ingest   # loads real GDPR text, the firm playbook, and seed matters
npm run dev
```

Visit `/health` first to confirm both Neo4j and Perplexity are reachable —
it reports the real connection error if either isn't configured correctly.

### Bringing your own matter

The litigation seed matter (a real SEC-filed settlement agreement) ingests
out of the box. To see the headline data-processing-agreement matter, drop a
real third-party DPA / vendor data-processing template into `data/contract.md`
(or `.txt`) and re-run `npm run ingest` — clauses are parsed generically
(markdown `## N. Heading` sections, or plain `N. Heading` numbered
paragraphs). Nothing is fabricated if the file is missing: ingest logs a
warning and skips that matter.

To run the Phase 5 "new information arrives" flip, drop a real document into
`data/subprocessor-update.md` (or `.txt`) — e.g. a notice that a vendor has
engaged a new sub-processor. The "New information arrives" button on a
matter page lets you pick which clause it should be weighed against.

Both `data/contract.{md,txt}` and `data/subprocessor-update.{md,txt}` are
gitignored by default — they're likely real, possibly confidential documents,
so they're never auto-committed even if you drop them in.

### Resetting for a clean demo run

```bash
npm run reset   # wipes the graph, then re-runs ingest from scratch
```

This is destructive (it deletes every Finding, Review, and SignOff you've
made, including ones from earlier demo runs) — only run it when you actually
want to start over.

### Tests

```bash
npm run test
```

The bi-temporal helpers (`assertFact`/`supersedeFact`/`snapshotAt`/
`traceFinding`) and the "new information arrives" flip run against the real
Neo4j instance configured in `.env.local` — graph-mutation logic has no
meaningful mock. Fixtures are namespaced (`__test_temporal__`,
`__test_newinfo__`) and cleaned up in `afterAll`, and the new-information test
backs up/restores `data/subprocessor-update.md` rather than risking a real
file you've dropped in.

## Document upload demo (pregnancy discrimination case)

This demo walks through a 7-day case lifecycle using real test documents.
Each day simulates a batch upload with the date picker in the upload dialog.

### Prerequisites

```bash
# Start both servers
npm run dev:full

# Hard reset (wipes Neo4j + Supabase + Storage + all users)
curl -X DELETE http://localhost:8000/api/wipe/hard-reset

# Sign up fresh at http://localhost:3000/login
```

### Quick test (2 documents)

Upload just these two files to verify the core flow works:

1. Upload `~/Downloads/Day 1/Email_first.odt` (date: `2026-05-20`, source: Human)
2. Upload `~/Downloads/Day 2/Email_proof.odt` (date: `2026-05-21`, source: Human)

You should see: two batches in the timeline, entities extracted for both, click filenames to view content.

### Full upload sequence

| Day | Simulated date | Files to upload |
|-----|---------------|-----------------|
| 1 | `2026-05-20` | `~/Downloads/Day 1/Email_first.odt` |
| 2 | `2026-05-21` | `~/Downloads/Day 2/Email_proof.odt`, `InternalMail.odt`, `Lawfirm_communication.odt`, `RatingSarah.odt` |
| 3 | `2026-05-22` | `~/Downloads/Day 3/Restructing Announcement.odt`, `WrittenStatementMail.odt` |
| 4 | `2026-05-23` | `~/Downloads/Day 4/Formal Complaint of Pregnancy Discrimination.docx` |
| 5 | `2026-05-24` | `~/Downloads/Day 5/Formal_Complaint_of_Pregnancy_Discrimination.docx` |
| 6 | `2026-05-25` | `~/Downloads/Day 6/LetterOfClaim_Mitchell_v_TechSolutions.pdf` |
| 7 | `2026-05-26` | `~/Downloads/Day 7/N1_Mitchell_v_TechSolutions.pdf`, `Pleadings_Exchange_Mitchell_v_TechSolutions.pdf`, `Skeleton_Argument_Mitchell_v_TechSolutions.pdf` |

After all 7 days, upload the evolved version to test semantic comparison + annotations:

| Bonus | `2026-05-28` | `~/Downloads/Sarah Mitchell – Pregnancy Discrimination and Unfair Dismissal.docx` |

### What to expect

- **Day 5** — The system detects `Formal_Complaint_of_Pregnancy_Discrimination.docx` as an **exact duplicate** of Day 4's file (same content, renamed with underscores). It skips extraction automatically.
- **Bonus upload** — The system detects the rewritten complaint as an **evolved version** of Day 4's original via LLM semantic comparison (only 15% text overlap, but same parties/matter/purpose). The annotation agent runs and produces inline review notes.
- **Timeline tab** — Shows document batches in reverse chronological order. Click any filename to open the document viewer.
- **Document viewer** — For evolved versions, shows the document text with colored inline highlights (legal issues, suggestions, strengths, grammar, changes) linked to post-it style annotation notes on the right sidebar.
- **Entity flowchart** — The Entities tab groups extracted entities by source document, ordered by upload time.

### API shortcuts

```bash
# Hard reset everything
curl -X DELETE http://localhost:8000/api/wipe/hard-reset

# Wipe only Neo4j
curl -X DELETE http://localhost:8000/api/wipe/neo4j

# Wipe only Supabase tables
curl -X DELETE http://localhost:8000/api/wipe/supabase

# Delete all users
curl -X DELETE http://localhost:8000/api/users

# Check health
curl http://localhost:8000/health
```

---

## Demo script

1. **Control tower** (`/`) — matters listed as cards; any matter with clauses
   in the "needs your judgement" lane shows an amber badge.
2. **Matter view** (`/matters/[id]`) — click into a matter, hit **Run
   analysis** to watch clauses get assessed live (streamed NDJSON progress),
   then see them sorted into three lanes by triage score.
3. **Inspect** — click a clause to open the reasoning, the actual GDPR
   article text it relied on (pulled live from the graph), any firm-playbook
   deviation, and the confidence/risk/consequence breakdown.
4. **Decide** — Approve / Amend / Reject / Escalate. Each writes a real
   Review (and a SignOff on approve) to the graph; the lane and badge update
   immediately.
5. **New information arrives** — ingest a real update document for one
   clause; watch it re-assess and (if the new information actually
   contradicts the prior belief) flip status.
6. **Time-scrub** — drag the scrubber on the matter page; watch the clause's
   status at each point in time, with the old fact's window closed (not
   deleted) at the exact moment the new episode landed.
7. **Ask Quinn** (bottom-right, any page) — "Which clauses rely on GDPR
   Article 28?", "What changed since yesterday?", "Which matters touch
   sub-processor obligations?" — answered from real graph traversals, with
   citations back to the nodes used.

## Quinn Query Agent — example queries

Quinn's chat uses a Strands-based agent with 5 tools that can search entities,
traverse graph relationships, read case intelligence events, check document
history, and retrieve document content. Here are queries that showcase its
reasoning — from simple lookups to multi-tool analysis.

### Simple queries

| Query | What it exercises |
|-------|-------------------|
| "Who are all the people involved in this case?" | Entity search by type |
| "What deadlines are coming up?" | Search Deadline/TimeConstraint entities |
| "Show me any contradictions that need attention" | Supabase case events (anomalies) |
| "When was the last document uploaded and by whom?" | Supabase document history |
| "What does the pre-action letter say?" | Document content retrieval |

### Multi-tool queries

| Query | Tools used |
|-------|-----------|
| "Who drafted the formal complaint and what obligations does it create for TechSolutions?" | search_entities → get_entity_relationships |
| "What are the key risks and which documents support them?" | search_entities (RiskFactor) + query_case_events |
| "Are there contradictions between what Mitchell claims and what TechSolutions states?" | query_case_events (anomalies) + search_entities + get_document_content |
| "Summarise the financial exposure — what amounts are at stake and who owes what?" | search_entities (MonetaryAmount) + get_entity_relationships (OBLIGATED_TO_PAY) |
| "What evidence shows TechSolutions was notified before the dismissal?" | search_entities (Date) + get_document_content + query_case_events |

### Complex analytical queries

| Query | Reasoning chain |
|-------|----------------|
| "Give me a litigation risk assessment — what's strong in our position and where are we vulnerable?" | Combines positive events + anomalies + risk factors + key obligations |
| "Trace the chain of events from the pregnancy disclosure to the dismissal — what's the timeline and what contradictions exist?" | Multi-hop graph traversal + event timeline + document content |
| "Which clauses in the employment contract were breached and what's the evidence for each?" | search_entities (Clause) → get_entity_relationships → get_document_content |
| "Compare what the internal emails say vs the formal complaint — are the narratives consistent?" | get_document_content (multiple docs) + query_case_events (anomalies) |
| "What's the strongest argument for pregnancy discrimination based on the extracted facts?" | search_entities (multiple types) + query_case_events (positive) + get_entity_relationships |

## Decisions & assumptions

- **No vector index.** Provision/playbook retrieval uses transparent
  keyword-overlap scoring (`lib/agent/retrieve.ts`) plus an explicit boost
  when a clause names an article number directly. With ~100 provisions and
  10 playbook rules this is fast and auditable; a real vector index would be
  the natural next step at scale.
- **GDPR ingestion source.** Cellar's SPARQL/content-negotiation endpoints
  don't expose clean per-article markup, so ingestion parses EUR-Lex's
  official consolidated HTML rendering of the Official Journal text instead
  (verified `div.eli-subdivision` structure) — still the genuine published
  text, with the source URL recorded on every `Provision`.
- **Triage formula** is a documented, fixed weighted blend of
  `(1 - confidence)`, risk, and consequence (`lib/agent/triage.ts`) — not
  learned, so it's auditable and explainable in the demo.
  Lane thresholds: ≥0.6 needs judgement, ≥0.3 quick confirm, else
  auto-cleared.
- **Second seed matter** is a real SEC EDGAR-filed settlement agreement
  (Independent Bank / Stanford receivership litigation), chosen because a
  fabricated "litigation matter" would violate the no-fabricated-legal-text
  rule — using a real public filing keeps the multi-matter control-tower view
  honest without requiring a second user-provided document.
- **Amend** rewrites the Finding's `summary` in place (a human correction of
  phrasing) rather than going through `assertFact`/`supersedeFact` — it's not
  a new temporal fact about compliance, just an edited explanation, so it
  doesn't get its own bi-temporal window.
- **Reviewer identity** is a single hardcoded `"Supervising partner"` — there's
  no auth/multi-user system in this build.
- **Chat routing** is intent-keyword-based (article numbers, change/since
  phrasing, playbook keywords, generic fallback) rather than full tool-calling
  — the model only ever sees pre-retrieved graph data, never raw access to
  invent facts, which was the priority over open-ended query flexibility.
