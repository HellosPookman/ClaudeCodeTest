import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Document, DocumentFieldEdit, AuditLog
from ..schemas import DocumentOut, DocumentListItem, DocumentFieldUpdate, FieldEditOut
from ..auth.utils import get_current_user, require_role
from ..services import storage as store
from ..config import get_settings

settings = get_settings()
router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _log(db, user_id, entity_id, action, metadata=None):
    db.add(AuditLog(actor_user_id=user_id, entity_type="document",
                    entity_id=entity_id, action=action, metadata=metadata))


@router.post("/upload", response_model=List[DocumentOut])
async def upload_documents(
    files: List[UploadFile] = File(...),
    document_type: Optional[str] = Form(None),  # receipt | invoice | None (auto-detect)
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    results = []
    use_batch = len(files) > settings.batch_upload_threshold

    for file in files:
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")

        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large: {file.filename}")

        doc_id = str(uuid.uuid4())
        file_hash = store.compute_sha256(file_bytes)
        file_key = store.build_document_key(doc_id, file.filename or "document")
        store.upload_file(file_bytes, file_key, content_type=file.content_type)

        # Generate thumbnail
        thumb_url = None
        thumb_bytes = store.generate_thumbnail(file_bytes, file.content_type)
        if thumb_bytes:
            thumb_key = store.build_thumbnail_key(doc_id)
            store.upload_file(thumb_bytes, thumb_key, content_type="image/jpeg")
            thumb_url = thumb_key

        doc = Document(
            id=doc_id,
            document_type=document_type or "receipt",
            source_type="upload",
            original_file_name=file.filename,
            mime_type=file.content_type,
            file_url=file_key,
            thumbnail_url=thumb_url,
            file_hash=file_hash,
            status="Uploaded",
            uploaded_by=current_user.id,
        )
        db.add(doc)
        db.flush()
        _log(db, current_user.id, doc_id, "upload", {"filename": file.filename})
        results.append(doc)

    db.commit()

    # Queue OCR jobs
    from ..workers.tasks import process_document
    for doc in results:
        if use_batch:
            process_document.apply_async(args=[doc.id], countdown=2)
        else:
            process_document.delay(doc.id)

    for doc in results:
        db.refresh(doc)
    return results


@router.post("/mobile-capture", response_model=DocumentOut)
async def mobile_capture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mobile-specific endpoint for camera-captured receipt images."""
    file_bytes = await file.read()
    doc_id = str(uuid.uuid4())
    file_hash = store.compute_sha256(file_bytes)
    file_key = store.build_document_key(doc_id, file.filename or "capture.jpg")
    store.upload_file(file_bytes, file_key, content_type=file.content_type or "image/jpeg")

    thumb_url = None
    thumb_bytes = store.generate_thumbnail(file_bytes, file.content_type or "image/jpeg")
    if thumb_bytes:
        thumb_key = store.build_thumbnail_key(doc_id)
        store.upload_file(thumb_bytes, thumb_key, content_type="image/jpeg")
        thumb_url = thumb_key

    doc = Document(
        id=doc_id,
        document_type="receipt",
        source_type="mobile_capture",
        original_file_name=file.filename,
        mime_type=file.content_type,
        file_url=file_key,
        thumbnail_url=thumb_url,
        file_hash=file_hash,
        status="Uploaded",
        uploaded_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    _log(db, current_user.id, doc_id, "mobile_capture")
    db.commit()

    from ..workers.tasks import process_document
    process_document.delay(doc_id)
    return doc


@router.get("", response_model=List[DocumentListItem])
def list_documents(
    document_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    duplicate_only: bool = Query(False),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Document).filter(Document.is_deleted == False)
    if document_type:
        q = q.filter(Document.document_type == document_type)
    if status:
        q = q.filter(Document.status == status)
    if duplicate_only:
        q = q.filter(Document.duplicate_type.isnot(None))
    if search:
        q = q.filter(
            Document.vendor_name.ilike(f"%{search}%") |
            Document.invoice_number.ilike(f"%{search}%") |
            Document.original_file_name.ilike(f"%{search}%")
        )
    return q.order_by(Document.uploaded_at.desc()).offset(offset).limit(limit).all()


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/signed-url")
def get_signed_url(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    url = store.get_presigned_url(doc.file_url, expires_in=1800)
    return {"url": url}


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document_fields(
    document_id: str,
    body: DocumentFieldUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    editable_fields = ["vendor_name", "amount", "document_date", "document_time",
                       "invoice_number", "tax_amount"]
    for field in editable_fields:
        new_val = getattr(body, field, None)
        if new_val is not None:
            old_val = str(getattr(doc, field)) if getattr(doc, field) is not None else None
            setattr(doc, field, new_val)
            db.add(DocumentFieldEdit(
                document_id=document_id,
                field_name=field,
                old_value=old_val,
                new_value=str(new_val),
                edited_by=current_user.id,
                reason=body.reason,
            ))
    _log(db, current_user.id, document_id, "field_edit")
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{document_id}/edits", response_model=List[FieldEditOut])
def get_document_edits(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return db.query(DocumentFieldEdit).filter(
        DocumentFieldEdit.document_id == document_id
    ).order_by(DocumentFieldEdit.edited_at.desc()).all()


@router.get("/{document_id}/ocr-text")
def get_ocr_text(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"raw_ocr_text": doc.raw_ocr_text}


@router.post("/{document_id}/recheck-duplicates")
def recheck_duplicates(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from ..services import duplicate as dup_service
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    dup_type, conflict_id = dup_service.check_duplicates(
        db, doc.file_hash, doc.perceptual_hash, doc.invoice_number, exclude_id=document_id
    )
    doc.duplicate_type = dup_type
    _log(db, current_user.id, document_id, "recheck_duplicates", {"result": dup_type})
    db.commit()
    return {"duplicate_type": dup_type, "conflict_document_id": conflict_id}


@router.delete("/{document_id}", status_code=204)
def soft_delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "reviewer")),
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.is_deleted = True
    _log(db, current_user.id, document_id, "delete")
    db.commit()
