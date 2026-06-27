"""Extract text from uploaded files (PDF, plain text, images, email)."""

from __future__ import annotations

import hashlib
from pathlib import Path


def extract_text(file_path: str, content_type: str) -> str:
    """Extract text from a file based on its content type."""
    if content_type == "application/pdf":
        return _extract_pdf(file_path)
    if content_type in ("image/png", "image/jpeg", "image/jpg"):
        return _extract_image_ocr(file_path)
    if content_type == "message/rfc822" or file_path.endswith(".eml"):
        return _extract_eml(file_path)
    if content_type == "application/vnd.oasis.opendocument.text" or file_path.endswith(".odt"):
        return _extract_odt(file_path)
    # Plain text, markdown, etc.
    return Path(file_path).read_text(encoding="utf-8", errors="replace")


def _extract_pdf(file_path: str) -> str:
    import pymupdf

    doc = pymupdf.open(file_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()
    return "\n\n".join(pages)


def _extract_image_ocr(file_path: str) -> str:
    """OCR via pytesseract for PNG/JPG images."""
    from PIL import Image
    import pytesseract

    image = Image.open(file_path)
    text = pytesseract.image_to_string(image)
    return text.strip()


def _extract_eml(file_path: str) -> str:
    """Parse .eml email files — extract headers + body text."""
    import email
    from email import policy

    with open(file_path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    parts = []
    for header in ("From", "To", "Cc", "Date", "Subject"):
        val = msg.get(header)
        if val:
            parts.append(f"{header}: {val}")

    parts.append("---")

    body = msg.get_body(preferencelist=("plain", "html"))
    if body:
        content = body.get_content()
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")
        parts.append(content)

    return "\n".join(parts)


def _extract_odt(file_path: str) -> str:
    """Extract text from .odt (OpenDocument Text) files."""
    import zipfile
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(file_path) as z:
        with z.open("content.xml") as f:
            tree = ET.parse(f)

    # Extract all text content, stripping XML tags
    root = tree.getroot()
    texts = []
    for elem in root.iter():
        if elem.text:
            texts.append(elem.text)
        if elem.tail:
            texts.append(elem.tail)
    return "\n".join(t.strip() for t in texts if t.strip())


def content_hash(text: str) -> str:
    """SHA-256 hash of the text content for dedup and integrity."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
