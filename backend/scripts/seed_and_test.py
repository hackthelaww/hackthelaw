#!/usr/bin/env python3
"""Seed two sample matters sharing a party, then query the connection.

Usage:
    cd backend
    uv run python scripts/seed_and_test.py

This is the Phase 1 acceptance test.
"""

import asyncio

from app.db import get_driver, close_driver
from app.config import settings  # noqa: F401


SEED_CYPHER = """
// Matter 1 — litigation
MERGE (m1:Matter {id: 'stanford-settlement'})
  SET m1.name = 'Stanford receivership settlement',
      m1.description = 'Settlement negotiations with the Stanford Receivership Estate',
      m1.client = 'Independent Bank Group',
      m1.created_at = datetime(),
      m1.updated_at = datetime()

// Matter 2 — contract review
MERGE (m2:Matter {id: 'vendor-dpa'})
  SET m2.name = 'Vendor data-processing agreement',
      m2.description = 'DPA review for cloud vendor onboarding',
      m2.client = 'Independent Bank Group',
      m2.created_at = datetime(),
      m2.updated_at = datetime()

// Shared opposing counsel firm
MERGE (f:Party {id: 'baker-hostetler'})
  SET f.name = 'Baker Hostetler LLP',
      f.role = 'opposing_counsel'

// Link both matters to the same firm
MERGE (m1)-[:HAS_PARTY]->(f)
MERGE (m2)-[:HAS_PARTY]->(f)

// A client party
MERGE (c:Party {id: 'independent-bank'})
  SET c.name = 'Independent Bank Group, Inc.',
      c.role = 'client'
MERGE (m1)-[:HAS_PARTY]->(c)
MERGE (m2)-[:HAS_PARTY]->(c)

// A document on matter 1
MERGE (d1:Document {id: 'settlement-agreement-v1'})
  SET d1.title = 'Settlement Agreement',
      d1.doc_type = 'agreement',
      d1.matter_id = 'stanford-settlement',
      d1.created_at = datetime()
MERGE (d1)-[:BELONGS_TO]->(m1)

// A deadline on matter 1
MERGE (dl:Deadline {id: 'settlement-response-deadline'})
  SET dl.title = 'Response to settlement offer',
      dl.due_at = datetime('2026-07-15T17:00:00Z'),
      dl.matter_id = 'stanford-settlement'
MERGE (dl)-[:BELONGS_TO]->(m1)

RETURN 'seeded' AS status
"""

QUERY_SHARED = """
MATCH (m1:Matter)-[:HAS_PARTY]->(shared:Party)<-[:HAS_PARTY]-(m2:Matter)
WHERE m1.id <> m2.id
RETURN DISTINCT shared.name AS shared_party,
       collect(DISTINCT m1.name) + collect(DISTINCT m2.name) AS matters
"""


async def main() -> None:
    driver = get_driver()

    # Seed
    async with driver.session(database="neo4j") as session:
        await session.run(SEED_CYPHER)
    print("✓ Seed data written")

    # Query
    async with driver.session(database="neo4j") as session:
        result = await session.run(QUERY_SHARED)
        records = await result.data()

    if not records:
        print("✗ No shared parties found — something is wrong")
    else:
        for r in records:
            print(f"✓ Shared party: {r['shared_party']}")
            print(f"  Across matters: {r['matters']}")

    await close_driver()


if __name__ == "__main__":
    asyncio.run(main())
