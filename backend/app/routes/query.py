"""Query endpoint — runs the Strands query agent to answer case questions."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth_middleware import AuthUser, get_current_user

router = APIRouter(prefix="/api", tags=["query"])


class QueryRequest(BaseModel):
    question: str
    matterId: str


@router.post("/query")
async def query_case(body: QueryRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    from app.ingest.query_agent import run_query_agent

    try:
        result = await run_query_agent(
            question=body.question,
            matter_id=body.matterId,
        )
        return result
    except Exception as e:
        raise HTTPException(500, detail=f"Query agent error: {e}")
