"""Seed endpoint — populates the graph with demo data matching the frontend's expected schema.

The frontend (Quinn) expects these node types and relationships:
  - Matter (id, name, client, type, status)
  - Party (id, name, role) linked via (:Matter)-[:INVOLVES]->(:Party)
  - Clause (id, ref, heading, text, matterId) with matterId property
  - Episode (id, kind, label, payloadRef, createdAt)
  - Finding (id, status, confidence, riskScore, consequenceScore, triageScore, summary)
      linked via (:Clause)-[:ASSESSED_AS {validAt, invalidAt, createdAt, expiredAt}]->(:Finding)
  - Provision (id, celex, article, title, text, source)
      linked via (:Finding)-[:RELIES_ON]->(:Provision)
  - PlaybookRule (id, code, title, requirement)
      linked via (:Finding)-[:DEVIATES_FROM {explanation}]->(:PlaybookRule)
  - (:Finding)-[:DERIVED_FROM]->(:Episode)
  - (:Episode)-[:MENTIONS]->(:Clause|Provision|PlaybookRule|Matter)
  - Review, SignOff (created by human actions, not seeded)

POST /api/seed         — seed demo data
POST /api/seed/reset   — wipe everything and re-seed
"""

import uuid
import time

from fastapi import APIRouter

from app.db import write_query, read_query

router = APIRouter(prefix="/api/seed", tags=["seed"])


def _now_ms() -> int:
    return int(time.time() * 1000)


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Demo data constants
# ---------------------------------------------------------------------------

MATTERS = [
    {
        "id": "stanford-settlement-litigation",
        "name": "Stanford receivership settlement — Independent Bank",
        "client": "Independent Bank Group, Inc.",
        "type": "litigation",
        "status": "in_review",
        "parties": [
            {"name": "Independent Bank (formerly Bank of Houston)", "role": "client"},
            {"name": "Ralph S. Janvey, Receiver for the Stanford Receivership Estate", "role": "counterparty"},
            {"name": "Official Stanford Investors Committee", "role": "counterparty"},
            {"name": "Rotstain Investor Plaintiffs", "role": "counterparty"},
        ],
        "clauses": [
            {
                "ref": "27",
                "heading": "Delivery of Settlement Amount",
                "text": "Within five (5) business days after the Settlement Effective Date, the Receiver shall provide to Independent's counsel wiring instructions for payment of the Settlement Amount to the Receiver. Within thirty (30) days after the later of the Settlement Effective Date or receipt of the wiring instructions, Independent shall deliver or cause to be delivered the Settlement Amount to the Receiver.",
            },
            {
                "ref": "29",
                "heading": "No Liability",
                "text": "Independent and the Independent Released Parties shall have no liability, obligation, or responsibility whatsoever with respect to the investment, management, use, administration, or distribution of the Settlement Amount or any portion thereof.",
            },
            {
                "ref": "42",
                "heading": "Release of the Independent Released Parties",
                "text": "As of the Settlement Effective Date, each of the Plaintiffs fully, finally, and forever release, relinquish, and discharge, with prejudice, all Settled Claims against Independent and the Independent Released Parties.",
            },
            {
                "ref": "43",
                "heading": "Release of Plaintiffs Released Parties",
                "text": "As of the Settlement Effective Date, Independent fully, finally, and forever releases, relinquishes, and discharges, with prejudice, all Settled Claims against the Plaintiffs Released Parties.",
            },
            {
                "ref": "50",
                "heading": "Confidentiality",
                "text": "The Parties and their counsel will keep confidential and shall not publish, communicate, or otherwise disclose, directly or indirectly, Confidential Information to any Person, except as permitted by the enumerated exceptions in the agreement.",
            },
            {
                "ref": "59",
                "heading": "Cooperation",
                "text": "The Parties agree to execute any additional documents reasonably necessary to finalize and carry out the terms of this Settlement Agreement and to cooperate to defend and enforce the Bar Order.",
            },
            {
                "ref": "61",
                "heading": "Choice of Law",
                "text": "This Settlement Agreement shall be governed by and construed and enforced in accordance with the laws of the State of Texas, without regard to the choice-of-law principles of Texas or any other jurisdiction.",
            },
        ],
    },
    {
        "id": "vendor-dpa-review",
        "name": "Vendor data-processing agreement review",
        "client": "Acme Corp",
        "type": "data-processing-agreement",
        "status": "in_review",
        "parties": [
            {"name": "Acme Corp", "role": "client"},
            {"name": "CloudVendor Inc.", "role": "counterparty"},
        ],
        "clauses": [
            {
                "ref": "1",
                "heading": "Sub-processor authorisation",
                "text": "The Processor may engage sub-processors with the Controller's general written authorisation. The Processor shall inform the Controller of any intended changes concerning the addition or replacement of sub-processors, giving the Controller the opportunity to object.",
            },
            {
                "ref": "2",
                "heading": "Data breach notification",
                "text": "The Processor shall notify the Controller without undue delay after becoming aware of a personal data breach. Notification shall include the nature of the breach, categories of data subjects affected, and recommended mitigation measures.",
            },
            {
                "ref": "3",
                "heading": "International transfers",
                "text": "Personal data shall not be transferred outside the EEA unless adequate safeguards are in place, including Standard Contractual Clauses approved by the European Commission.",
            },
            {
                "ref": "4",
                "heading": "Audit rights",
                "text": "The Controller shall have the right to audit the Processor's compliance with this agreement, including on-site inspections with reasonable notice.",
            },
            {
                "ref": "5",
                "heading": "Data return and deletion",
                "text": "Upon termination, the Processor shall, at the Controller's choice, return or delete all personal data and certify the deletion in writing.",
            },
        ],
    },
]

PLAYBOOK_RULES = [
    {"code": "DPA-01", "title": "Sub-processor authorisation", "requirement": "The processor must not engage a sub-processor without the controller's prior specific or general written authorisation."},
    {"code": "DPA-02", "title": "Flow-down of obligations", "requirement": "The same data-protection obligations must be imposed on sub-processors by contract."},
    {"code": "DPA-03", "title": "Audit and inspection rights", "requirement": "The controller must have the right to audit the processor's compliance."},
    {"code": "DPA-04", "title": "Breach notification timeline", "requirement": "The processor must notify the controller of a breach within 48 hours."},
    {"code": "DPA-05", "title": "Data return or deletion on termination", "requirement": "On termination, the processor must delete or return all personal data."},
    {"code": "DPA-06", "title": "International transfer safeguards", "requirement": "Any transfer outside the EEA must be covered by an adequacy decision or SCCs."},
    {"code": "DPA-07", "title": "Confidentiality of processing personnel", "requirement": "Persons authorised to process personal data must be bound by a confidentiality obligation."},
    {"code": "DPA-08", "title": "Assistance with data subject rights", "requirement": "The processor must assist the controller in responding to data subject requests."},
    {"code": "DPA-09", "title": "Security of processing", "requirement": "The processor must implement appropriate technical and organisational security measures."},
    {"code": "DPA-10", "title": "Documented processing instructions", "requirement": "The processor must process personal data only on documented instructions from the controller."},
]

# Pre-built findings so the frontend has something to display in the triage lanes
SAMPLE_FINDINGS: dict[str, dict] = {
    # vendor-dpa clauses with DPA-relevant findings
    "vendor-dpa-review::clause::1": {
        "status": "partially_compliant",
        "confidence": 0.75,
        "riskScore": 0.6,
        "consequenceScore": 0.5,
        "summary": "General authorisation is mentioned but the clause lacks a mechanism for the Controller to object to new sub-processors within a defined timeframe.",
        "deviations": [{"ruleCode": "DPA-01", "explanation": "No objection window specified for sub-processor changes."}],
    },
    "vendor-dpa-review::clause::2": {
        "status": "non_compliant",
        "confidence": 0.85,
        "riskScore": 0.8,
        "consequenceScore": 0.7,
        "summary": "Notification timeline says 'without undue delay' but does not specify the 48-hour hard deadline required by firm policy.",
        "deviations": [{"ruleCode": "DPA-04", "explanation": "Missing 48-hour hard deadline for breach notification."}],
    },
    "vendor-dpa-review::clause::3": {
        "status": "compliant",
        "confidence": 0.9,
        "riskScore": 0.2,
        "consequenceScore": 0.3,
        "summary": "Adequate — clause explicitly references SCCs and restricts transfers to jurisdictions with adequacy decisions.",
    },
    "vendor-dpa-review::clause::4": {
        "status": "compliant",
        "confidence": 0.88,
        "riskScore": 0.15,
        "consequenceScore": 0.2,
        "summary": "Audit rights are clearly granted with reasonable notice provisions.",
    },
    "vendor-dpa-review::clause::5": {
        "status": "partially_compliant",
        "confidence": 0.7,
        "riskScore": 0.5,
        "consequenceScore": 0.4,
        "summary": "Deletion or return is addressed but no certification of deletion is required.",
        "deviations": [{"ruleCode": "DPA-05", "explanation": "No written certification of deletion upon termination."}],
    },
}


def _slugify(value: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _triage_score(confidence: float, risk: float, consequence: float) -> float:
    return round((1 - confidence) * 0.4 + risk * 0.35 + consequence * 0.25, 4)


async def _seed_constraints() -> None:
    """Ensure the frontend's expected constraints exist."""
    constraints = [
        "CREATE CONSTRAINT episode_id IF NOT EXISTS FOR (n:Episode) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT matter_id IF NOT EXISTS FOR (n:Matter) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT party_id IF NOT EXISTS FOR (n:Party) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT clause_id IF NOT EXISTS FOR (n:Clause) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT provision_id IF NOT EXISTS FOR (n:Provision) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT playbook_id IF NOT EXISTS FOR (n:PlaybookRule) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT finding_id IF NOT EXISTS FOR (n:Finding) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT review_id IF NOT EXISTS FOR (n:Review) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT signoff_id IF NOT EXISTS FOR (n:SignOff) REQUIRE n.id IS UNIQUE",
    ]
    for c in constraints:
        await write_query(c)


async def _seed_playbook() -> None:
    episode_id = _uuid()
    ts = _now_ms()
    await write_query(
        "CREATE (e:Episode {id: $id, kind: 'DOCUMENT_INGESTED', label: 'Firm playbook ingested', payloadRef: 'data/playbook.json', createdAt: $ts})",
        {"id": episode_id, "ts": ts},
    )
    for rule in PLAYBOOK_RULES:
        await write_query(
            """
            MERGE (r:PlaybookRule {id: $id})
            SET r.code = $code, r.title = $title, r.requirement = $requirement
            WITH r
            MATCH (e:Episode {id: $eid})
            MERGE (e)-[:MENTIONS]->(r)
            """,
            {"id": rule["code"], "code": rule["code"], "title": rule["title"], "requirement": rule["requirement"], "eid": episode_id},
        )


async def _seed_matters() -> None:
    for matter in MATTERS:
        ts = _now_ms()
        episode_id = _uuid()

        # Matter node
        await write_query(
            "MERGE (m:Matter {id: $id}) SET m.name = $name, m.client = $client, m.type = $type, m.status = $status",
            {"id": matter["id"], "name": matter["name"], "client": matter["client"], "type": matter["type"], "status": matter["status"]},
        )

        # Episode for document ingestion
        await write_query(
            "CREATE (e:Episode {id: $id, kind: 'DOCUMENT_INGESTED', label: $label, payloadRef: $ref, createdAt: $ts})",
            {"id": episode_id, "label": f"Matter document ingested: {matter['name']}", "ref": f"data/{matter['id']}.md", "ts": ts},
        )

        # Parties
        for party in matter["parties"]:
            party_id = f"{matter['id']}::party::{_slugify(party['name'])}"
            await write_query(
                """
                MERGE (p:Party {id: $id})
                SET p.name = $name, p.role = $role
                WITH p
                MATCH (m:Matter {id: $mid})
                MERGE (m)-[:INVOLVES]->(p)
                """,
                {"id": party_id, "name": party["name"], "role": party["role"], "mid": matter["id"]},
            )

        # Clauses
        for clause in matter["clauses"]:
            clause_id = f"{matter['id']}::clause::{_slugify(clause['ref'])}"
            await write_query(
                """
                MERGE (c:Clause {id: $id})
                SET c.ref = $ref, c.heading = $heading, c.text = $text, c.matterId = $mid
                WITH c
                MATCH (e:Episode {id: $eid})
                MERGE (e)-[:MENTIONS]->(c)
                """,
                {"id": clause_id, "ref": clause["ref"], "heading": clause["heading"], "text": clause["text"], "mid": matter["id"], "eid": episode_id},
            )

            # If there's a pre-built finding for this clause, create it
            finding_data = SAMPLE_FINDINGS.get(clause_id)
            if finding_data:
                finding_id = _uuid()
                triage = _triage_score(finding_data["confidence"], finding_data["riskScore"], finding_data["consequenceScore"])

                # Create finding + ASSESSED_AS edge (bi-temporal)
                await write_query(
                    """
                    MATCH (c:Clause {id: $cid})
                    CREATE (f:Finding {
                        id: $fid, status: $status, confidence: $confidence,
                        riskScore: $risk, consequenceScore: $consequence,
                        triageScore: $triage, summary: $summary
                    })
                    CREATE (c)-[:ASSESSED_AS {validAt: $ts, invalidAt: null, createdAt: $ts, expiredAt: null}]->(f)
                    """,
                    {
                        "cid": clause_id, "fid": finding_id,
                        "status": finding_data["status"], "confidence": finding_data["confidence"],
                        "risk": finding_data["riskScore"], "consequence": finding_data["consequenceScore"],
                        "triage": triage, "summary": finding_data["summary"], "ts": ts,
                    },
                )

                # Link finding to episode
                await write_query(
                    """
                    MATCH (f:Finding {id: $fid}), (e:Episode {id: $eid})
                    MERGE (f)-[:DERIVED_FROM]->(e)
                    """,
                    {"fid": finding_id, "eid": episode_id},
                )

                # Link deviations to playbook rules
                for dev in finding_data.get("deviations", []):
                    await write_query(
                        """
                        MATCH (f:Finding {id: $fid}), (r:PlaybookRule {id: $rid})
                        MERGE (f)-[:DEVIATES_FROM {explanation: $explanation}]->(r)
                        """,
                        {"fid": finding_id, "rid": dev["ruleCode"], "explanation": dev["explanation"]},
                    )


@router.post("")
async def seed() -> dict:
    """Seed the graph with demo data. Idempotent (uses MERGE)."""
    await _seed_constraints()
    await _seed_playbook()
    await _seed_matters()

    # Count what we have
    counts = await read_query(
        """
        OPTIONAL MATCH (m:Matter) WITH count(m) AS matters
        OPTIONAL MATCH (c:Clause) WITH matters, count(c) AS clauses
        OPTIONAL MATCH (p:Party) WITH matters, clauses, count(p) AS parties
        OPTIONAL MATCH (f:Finding) WITH matters, clauses, parties, count(f) AS findings
        OPTIONAL MATCH (r:PlaybookRule) WITH matters, clauses, parties, findings, count(r) AS rules
        OPTIONAL MATCH (e:Episode) WITH matters, clauses, parties, findings, rules, count(e) AS episodes
        RETURN matters, clauses, parties, findings, rules, episodes
        """
    )
    return {"status": "seeded", "counts": counts[0] if counts else {}}


@router.post("/reset")
async def reset_and_seed() -> dict:
    """Wipe the entire graph and re-seed. Use with caution."""
    await write_query("MATCH (n) DETACH DELETE n")
    return await seed()
