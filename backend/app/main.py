"""FastAPI application — the single entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import close_driver, ping


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — nothing to do yet (driver is lazy)
    yield
    # Shutdown
    await close_driver()


app = FastAPI(
    title="HackTheLaw — Legal Second Brain",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    neo4j_status = await ping()
    return {
        "status": "ok" if neo4j_status.get("ok") else "degraded",
        "neo4j": neo4j_status,
    }
