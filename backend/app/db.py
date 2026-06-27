"""Neo4j driver — single async driver instance shared across the app."""

from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncManagedTransaction
from neo4j import time as neo4j_time
from neo4j.graph import Node, Relationship

from app.config import settings

_driver: AsyncDriver | None = None


def get_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
        )
    return _driver


async def close_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


def _to_native(value):
    """Convert Neo4j types to JSON-serializable Python types."""
    if isinstance(value, (neo4j_time.DateTime, neo4j_time.Date, neo4j_time.Time)):
        return value.iso_format()
    if isinstance(value, neo4j_time.Duration):
        return str(value)
    if hasattr(value, "int") and callable(getattr(value, "int", None)):
        return int(value)
    if isinstance(value, Node):
        return {**dict(value), "_labels": list(value.labels)}
    if isinstance(value, Relationship):
        return dict(value)
    if isinstance(value, dict):
        return {k: _to_native(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_native(v) for v in value]
    return value


async def read_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a read transaction and return results as list of JSON-safe dicts."""
    async with get_driver().session(database="neo4j") as session:

        async def _work(tx: AsyncManagedTransaction) -> list[dict]:
            result = await tx.run(cypher, params or {})
            records = await result.data()
            return [_to_native(r) for r in records]

        return await session.execute_read(_work)


async def write_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a write transaction and return results as list of JSON-safe dicts."""
    async with get_driver().session(database="neo4j") as session:

        async def _work(tx: AsyncManagedTransaction) -> list[dict]:
            result = await tx.run(cypher, params or {})
            records = await result.data()
            return [_to_native(r) for r in records]

        return await session.execute_write(_work)


def write_query_sync(cypher: str, params: dict | None = None) -> list[dict]:
    """Synchronous write — for use inside Strands @tool functions."""
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_username, settings.neo4j_password),
    )
    with driver.session(database="neo4j") as session:
        result = session.run(cypher, params or {})
        records = [_to_native(dict(r)) for r in result]
    driver.close()
    return records


def read_query_sync(cypher: str, params: dict | None = None) -> list[dict]:
    """Synchronous read — for use inside Strands @tool functions."""
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_username, settings.neo4j_password),
    )
    with driver.session(database="neo4j") as session:
        result = session.run(cypher, params or {})
        records = [_to_native(dict(r)) for r in result]
    driver.close()
    return records


async def ping() -> dict:
    """Verify connectivity to Neo4j."""
    try:
        await get_driver().verify_connectivity()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
