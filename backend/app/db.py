"""Neo4j driver — single async driver instance shared across the app."""

from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncManagedTransaction

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


async def read_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a read transaction and return results as list of dicts."""
    async with get_driver().session(database="neo4j") as session:

        async def _work(tx: AsyncManagedTransaction) -> list[dict]:
            result = await tx.run(cypher, params or {})
            records = await result.data()
            return records

        return await session.execute_read(_work)


async def write_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a write transaction and return results as list of dicts."""
    async with get_driver().session(database="neo4j") as session:

        async def _work(tx: AsyncManagedTransaction) -> list[dict]:
            result = await tx.run(cypher, params or {})
            records = await result.data()
            return records

        return await session.execute_write(_work)


async def ping() -> dict:
    """Verify connectivity to Neo4j."""
    try:
        await get_driver().verify_connectivity()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
