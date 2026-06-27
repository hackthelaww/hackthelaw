"""Document embeddings via Perplexity API — builds a representation space
for semantic document similarity.

Each document gets embedded into a vector. Cosine similarity between vectors
reveals how related documents are, regardless of wording differences.
"""

from __future__ import annotations

import base64
import json
import math

import httpx

from app.config import settings


EMBED_MODEL = "pplx-embed-v1-4b"
EMBED_URL = "https://api.perplexity.ai/v1/embeddings"


def _decode_embedding(b64_string: str) -> list[float]:
    """Decode a base64-encoded int8 embedding to float32 list."""
    raw = base64.b64decode(b64_string)
    return [float(b) if b < 128 else float(b - 256) for b in raw]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def embed_text(text: str) -> list[float] | None:
    """Embed a single text using Perplexity's pplx-embed model.

    Returns the embedding vector, or None if the API call fails.
    """
    api_key = settings.perplexity_api_key if hasattr(settings, "perplexity_api_key") else ""
    if not api_key:
        # Try from env directly
        import os
        api_key = os.environ.get("PERPLEXITY_API_KEY", "")
    if not api_key:
        return None

    # Truncate very long texts (API has token limits)
    truncated = text[:12000]

    try:
        response = httpx.post(
            EMBED_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "input": [truncated],
                "model": EMBED_MODEL,
            },
            timeout=30,
        )

        if response.status_code != 200:
            return None

        data = response.json()
        emb_data = data["data"][0]["embedding"]

        # Handle both base64-encoded and raw list formats
        if isinstance(emb_data, str):
            return _decode_embedding(emb_data)
        elif isinstance(emb_data, list):
            return emb_data
        return None

    except Exception:
        return None


def embed_texts(texts: list[str]) -> list[list[float] | None]:
    """Embed multiple texts in a single API call (up to 512)."""
    api_key = settings.perplexity_api_key if hasattr(settings, "perplexity_api_key") else ""
    if not api_key:
        import os
        api_key = os.environ.get("PERPLEXITY_API_KEY", "")
    if not api_key:
        return [None] * len(texts)

    truncated = [t[:12000] for t in texts]

    try:
        response = httpx.post(
            EMBED_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "input": truncated,
                "model": EMBED_MODEL,
            },
            timeout=60,
        )

        if response.status_code != 200:
            return [None] * len(texts)

        data = response.json()
        results: list[list[float] | None] = []
        for item in data["data"]:
            emb = item["embedding"]
            if isinstance(emb, str):
                results.append(_decode_embedding(emb))
            elif isinstance(emb, list):
                results.append(emb)
            else:
                results.append(None)
        return results

    except Exception:
        return [None] * len(texts)


def find_similar_by_embedding(
    new_embedding: list[float],
    existing_embeddings: list[dict],
    threshold: float = 0.7,
) -> list[dict]:
    """Find documents similar to a new one by comparing embeddings.

    Args:
        new_embedding: The embedding of the new document.
        existing_embeddings: List of {"id": str, "filename": str, "embedding": list[float]}
        threshold: Minimum cosine similarity to consider (0-1).

    Returns:
        List of {"id", "filename", "similarity"} sorted by similarity descending.
    """
    matches = []
    for doc in existing_embeddings:
        emb = doc.get("embedding")
        if not emb:
            continue
        sim = cosine_similarity(new_embedding, emb)
        if sim >= threshold:
            matches.append({
                "id": doc["id"],
                "filename": doc.get("filename", ""),
                "similarity": round(sim, 4),
            })

    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches
