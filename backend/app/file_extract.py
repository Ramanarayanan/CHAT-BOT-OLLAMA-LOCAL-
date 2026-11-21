import csv
import io
from typing import Literal

from pypdf import PdfReader

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 80_000

DocumentKind = Literal["pdf", "csv"]


def _truncate(text: str) -> tuple[str, bool]:
    cleaned = text.strip()
    if len(cleaned) <= MAX_TEXT_CHARS:
        return cleaned, False
    return cleaned[:MAX_TEXT_CHARS].rstrip() + "\n\n[…truncated…]", True


def extract_pdf(data: bytes) -> tuple[str, bool]:
    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(f"--- Page {index} ---\n{page_text.strip()}")
    text = "\n\n".join(pages).strip()
    if not text:
        raise ValueError("No extractable text found in this PDF (it may be scanned/image-only).")
    return _truncate(text)


def extract_csv(data: bytes) -> tuple[str, bool]:
    # Prefer utf-8; fall back for Excel-exported CSVs.
    try:
        raw = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raw = data.decode("latin-1")

    sample = raw[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(io.StringIO(raw), dialect)
    rows = list(reader)
    if not rows:
        raise ValueError("CSV file is empty.")

    # Keep a readable table-like preview for the model.
    lines = [", ".join(cell.strip() for cell in row) for row in rows]
    return _truncate("\n".join(lines))


def detect_kind(filename: str, content_type: str | None) -> DocumentKind:
    name = filename.lower()
    ctype = (content_type or "").lower()
    if name.endswith(".pdf") or ctype == "application/pdf":
        return "pdf"
    if name.endswith(".csv") or "csv" in ctype:
        return "csv"
    raise ValueError("Unsupported file type. Upload a PDF or CSV.")


def extract_document(
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> dict[str, object]:
    if not data:
        raise ValueError("File is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("File must be under 10MB.")

    kind = detect_kind(filename, content_type)
    if kind == "pdf":
        text, truncated = extract_pdf(data)
    else:
        text, truncated = extract_csv(data)

    return {
        "filename": filename,
        "kind": kind,
        "text": text,
        "truncated": truncated,
        "char_count": len(text),
    }
