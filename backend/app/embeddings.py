"""Real semantic embeddings — same Perplexity endpoint/model as the Next.js side
(lib/embeddings.ts), so embeddings written from either stack are directly
comparable. Perplexity's embeddings endpoint requires its own model names and
rejects the standard OpenAI "float" encoding — verified directly against the
live API; only `base64_int8` and `base64_binary` are accepted.
"""

import base64
import struct

import httpx

from app.config import settings

EMBED_MODEL = "pplx-embed-v1-0.6b"
EMBED_URL = "https://api.perplexity.ai/v1/embeddings"


def _decode_int8(b64: str) -> list[int]:
    raw = base64.b64decode(b64)
    return list(struct.unpack(f"{len(raw)}b", raw))


def embed_text_sync(text: str) -> list[int] | None:
    """Embeds a single text. Returns None (rather than raising) if no API key is
    configured, so entity extraction never breaks just because embeddings aren't
    set up — callers should treat a missing embedding as "not yet searchable",
    not as an error.
    """
    if not settings.perplexity_api_key:
        return None

    response = httpx.post(
        EMBED_URL,
        headers={"Authorization": f"Bearer {settings.perplexity_api_key}"},
        json={"model": EMBED_MODEL, "input": text, "encoding_format": "base64_int8"},
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    return _decode_int8(data["data"][0]["embedding"])
