"""FastAPI application — the single entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import close_driver, ping
from app.routes.matters import router as matters_router
from app.routes.graph import router as graph_router
from app.routes.seed import router as seed_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_driver()


app = FastAPI(
    title="HackTheLaw — Legal Second Brain",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Next.js frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(matters_router)
app.include_router(graph_router)
app.include_router(seed_router)


@app.get("/health")
async def health():
    neo4j_status = await ping()
    return {
        "status": "ok" if neo4j_status.get("ok") else "degraded",
        "neo4j": neo4j_status,
    }
