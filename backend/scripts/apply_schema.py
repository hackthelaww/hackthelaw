#!/usr/bin/env python3
"""Apply schema/001_init.cypher to the Neo4j database.

Usage:
    cd backend
    uv run python scripts/apply_schema.py
"""

import asyncio
import re
from pathlib import Path

from app.db import get_driver, close_driver
from app.config import settings  # noqa: F401 — triggers env loading


SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema" / "001_init.cypher"


def split_statements(cypher_text: str) -> list[str]:
    """Split a .cypher file into individual statements, ignoring comments and blanks."""
    statements: list[str] = []
    current: list[str] = []
    for line in cypher_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        current.append(line)
        if stripped.endswith(";"):
            stmt = "\n".join(current).strip().rstrip(";")
            if stmt:
                statements.append(stmt)
            current = []
    # Handle last statement without trailing semicolon
    if current:
        stmt = "\n".join(current).strip().rstrip(";")
        if stmt:
            statements.append(stmt)
    return statements


async def main() -> None:
    cypher_text = SCHEMA_FILE.read_text()
    statements = split_statements(cypher_text)

    print(f"Applying {len(statements)} statements from {SCHEMA_FILE.name}...")

    driver = get_driver()
    async with driver.session(database="neo4j") as session:
        for i, stmt in enumerate(statements, 1):
            # Extract a short label for logging
            label = re.search(r"(?:CONSTRAINT|INDEX)\s+(\S+)", stmt)
            name = label.group(1) if label else f"statement-{i}"
            try:
                await session.run(stmt)
                print(f"  [{i}/{len(statements)}] {name} ✓")
            except Exception as e:
                print(f"  [{i}/{len(statements)}] {name} ✗ — {e}")

    await close_driver()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
