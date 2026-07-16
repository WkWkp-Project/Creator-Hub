"""Shared upload validation helpers."""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException

ZIP_SIGNATURES = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
UTF16_BOMS = (b"\xff\xfe", b"\xfe\xff")


def validate_spreadsheet_upload(
    filename: str | None,
    raw: bytes,
    *,
    allowed_extensions: set[str],
    max_mb: int,
    allow_xlsm: bool = False,
) -> str:
    """Validate extension, size, emptiness, and basic file signature.

    This is intentionally lightweight: it rejects obvious type spoofing before
    pandas/openpyxl spend CPU parsing the file.
    """
    ext = Path(filename or "").suffix.lower()
    allowed = {e.lower() for e in allowed_extensions}
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {sorted(allowed)}")
    if ext == ".xlsm" and not allow_xlsm:
        raise HTTPException(400, "Macro-enabled workbooks (.xlsm) are not allowed. Save as .xlsx and upload again.")
    if not raw:
        raise HTTPException(400, "Uploaded file is empty.")
    if len(raw) > max_mb * 1024 * 1024:
        raise HTTPException(400, f"File exceeds {max_mb}MB limit.")

    if ext in {".xlsx", ".xlsm"} and not raw.startswith(ZIP_SIGNATURES):
        raise HTTPException(400, "Excel workbook signature does not match the file extension.")
    if ext == ".xls" and not raw.startswith(OLE_SIGNATURE):
        raise HTTPException(400, "Legacy Excel workbook signature does not match the file extension.")
    if ext == ".csv":
        head = raw[:4096]
        if head.startswith(ZIP_SIGNATURES) or head.startswith(OLE_SIGNATURE):
            raise HTTPException(400, "CSV upload looks like a binary workbook. Use the correct file extension.")
        if b"\x00" in head and not head.startswith(UTF16_BOMS):
            raise HTTPException(400, "CSV upload must be a text file.")
    return ext
