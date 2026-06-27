"""FastAPI application — the single entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import close_driver, ping
from app.supabase_client import ping_supabase
from app.routes.matters import router as matters_router
from app.routes.cases import router as cases_router
from app.routes.members import router as members_router
from app.routes.graph import router as graph_router
from app.routes.seed import router as seed_router
from app.routes.documents import router as documents_router
from app.routes.entities import router as entities_router
from app.routes.users import router as users_router
from app.routes.wipe import router as wipe_router
from app.routes.case_events import router as case_events_router
from app.routes.timeline import router as timeline_router
from app.routes.query import router as query_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_driver()


app = FastAPI(
    title="HackTheLaw — Legal Second Brain",
    version="0.2.0",
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
app.include_router(matters_router)     # Legacy Neo4j-only matters CRUD
app.include_router(cases_router)       # New Supabase-backed cases CRUD
app.include_router(members_router)     # Team member management
app.include_router(graph_router)
app.include_router(seed_router)
app.include_router(documents_router)
app.include_router(entities_router)
app.include_router(users_router)       # Admin user management
app.include_router(wipe_router)        # Dev: wipe databases
app.include_router(timeline_router)    # Case timeline
app.include_router(case_events_router) # Case intelligence events
app.include_router(query_router)       # Query agent (chat)


@app.get("/health")
async def health():
    neo4j_status = await ping()
    supabase_status = ping_supabase()
    both_ok = neo4j_status.get("ok") and supabase_status.get("ok")
    return {
        "status": "ok" if both_ok else "degraded",
        "neo4j": neo4j_status,
        "supabase": supabase_status,
    }
