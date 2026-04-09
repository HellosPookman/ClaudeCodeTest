"""Duplicate detection: exact file hash, perceptual image hash, invoice number."""
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from ..models import Document


PHASH_DISTANCE_THRESHOLD = 10  # Hamming distance for near-image duplicates


def _phash_distance(h1: str, h2: str) -> int:
    """Compute Hamming distance between two hex perceptual hashes."""
    try:
        import imagehash
        return imagehash.hex_to_hash(h1) - imagehash.hex_to_hash(h2)
    except Exception:
        return 999


def check_duplicates(
    db: Session,
    file_hash: str,
    perceptual_hash: Optional[str],
    invoice_number: Optional[str],
    exclude_id: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Check for duplicates against existing documents.

    Returns:
        (duplicate_type, conflicting_document_id) where duplicate_type is one of:
        'exact_file' | 'near_image' | 'duplicate_invoice_number' | None
    """
    q = db.query(Document).filter(Document.is_deleted == False)
    if exclude_id:
        q = q.filter(Document.id != exclude_id)

    # 1. Exact file hash
    exact = q.filter(Document.file_hash == file_hash).first()
    if exact:
        return ("exact_file", exact.id)

    # 2. Near-image perceptual hash
    if perceptual_hash:
        candidates = q.filter(Document.perceptual_hash.isnot(None)).all()
        for doc in candidates:
            if doc.perceptual_hash and _phash_distance(perceptual_hash, doc.perceptual_hash) <= PHASH_DISTANCE_THRESHOLD:
                return ("near_image", doc.id)

    # 3. Duplicate invoice number (invoice docs only)
    if invoice_number:
        inv_dup = (
            q.filter(
                Document.document_type == "invoice",
                Document.invoice_number == invoice_number,
            ).first()
        )
        if inv_dup:
            return ("duplicate_invoice_number", inv_dup.id)

    return (None, None)
