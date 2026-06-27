"""Pydantic models — the shape of data at the API boundary."""

from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Matter (generic container for any legal case/project)
# ---------------------------------------------------------------------------

class MatterCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=128, description="Unique slug, e.g. 'stanford-settlement'")
    name: str = Field(..., min_length=1)
    description: str = ""
    client: str | None = None
    tags: list[str] = []


class Matter(MatterCreate):
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Party
# ---------------------------------------------------------------------------

class PartyCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1, description="e.g. 'client', 'opposing', 'counsel', 'judge', 'witness'")


class Party(PartyCreate):
    pass


# ---------------------------------------------------------------------------
# Document (logical container — "the petition", "my notes from the hearing")
# ---------------------------------------------------------------------------

class DocumentCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    title: str = Field(..., min_length=1)
    doc_type: str = ""  # free-form: "petition", "contract", "notes", "recording", "email"


class Document(DocumentCreate):
    matter_id: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Version (immutable snapshot of a document, with provenance)
# ---------------------------------------------------------------------------

class VersionSource(str, enum.Enum):
    ocr = "ocr"
    ai = "ai"
    human = "human"
    upload = "upload"  # raw upload without OCR


class VersionCreate(BaseModel):
    source: VersionSource
    content: str = Field(..., min_length=1)
    author: str | None = None
    model: str | None = None  # e.g. "claude-opus-4-6"
    content_hash: str | None = None  # computed server-side if not provided

    @model_validator(mode="after")
    def check_provenance(self) -> "VersionCreate":
        if self.source == VersionSource.human and not self.author:
            raise ValueError("author is required when source is 'human'")
        if self.source == VersionSource.ai and not self.model:
            raise ValueError("model is required when source is 'ai'")
        return self


class Version(BaseModel):
    id: str
    version_no: int
    source: VersionSource
    content: str
    content_hash: str
    author: str | None
    model: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Deadline / Event
# ---------------------------------------------------------------------------

class DeadlineCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    title: str
    due_at: datetime
    description: str = ""


class Deadline(DeadlineCreate):
    matter_id: str
