"""
Celery background workers for OCR extraction and PDF generation.
"""
from celery import Celery
from ..config import get_settings

settings = get_settings()

celery_app = Celery(
    "recon",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_document(self, document_id: str):
    """
    Full OCR pipeline for a single document:
    1. Download from storage
    2. Run OCR extraction
    3. Duplicate checks
    4. Persist results
    5. Trigger matching
    """
    from ..database import SessionLocal
    from ..models import Document
    from ..services import ocr as ocr_service
    from ..services import storage as store
    from ..services import duplicate as dup_service
    from ..services.matching import run_matching
    from datetime import date, time as dtime
    import dateutil.parser

    db = SessionLocal()
    try:
        doc = db.query(Document).get(document_id)
        if not doc:
            return

        doc.status = "Processing"
        db.commit()

        # Download file
        file_bytes = store.download_file(doc.file_url)

        # OCR
        result = ocr_service.extract(file_bytes, hint_doc_type=doc.document_type)

        # Parse dates
        parsed_date = None
        if result.document_date:
            try:
                parsed_date = dateutil.parser.parse(result.document_date).date()
            except Exception:
                pass

        parsed_time = None
        if result.document_time:
            try:
                parts = result.document_time.split(":")
                parsed_time = dtime(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
            except Exception:
                pass

        # Duplicate check
        phash = store.compute_perceptual_hash(file_bytes)
        dup_type, _ = dup_service.check_duplicates(
            db,
            file_hash=doc.file_hash,
            perceptual_hash=phash,
            invoice_number=result.invoice_number,
            exclude_id=document_id,
        )

        # Update document
        if result.document_type and not doc.document_type:
            doc.document_type = result.document_type
        doc.vendor_name = result.vendor_name
        doc.amount = result.amount
        doc.currency = result.currency
        doc.document_date = parsed_date
        doc.document_time = parsed_time
        doc.invoice_number = result.invoice_number
        doc.tax_amount = result.tax_amount
        doc.raw_ocr_text = result.raw_text
        doc.language_detected = result.language_detected
        doc.perceptual_hash = phash
        doc.extraction_confidence = result.overall_confidence
        doc.amount_confidence = result.field_confidence.amount
        doc.date_confidence = result.field_confidence.date
        doc.time_confidence = result.field_confidence.time
        doc.invoice_number_confidence = result.field_confidence.invoice_number
        doc.duplicate_type = dup_type

        # Determine document status
        cfg = settings
        missing_required = _check_missing_required(doc)
        low_confidence = _check_low_confidence(doc, cfg)

        if missing_required or low_confidence or dup_type:
            doc.status = "Needs Review" if (missing_required or dup_type) else "Low Confidence"
        else:
            doc.status = "Extracted"

        db.commit()

        # Trigger matching for this document
        run_matching(db, document_ids=[document_id])

    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc)
    finally:
        db.close()


def _check_missing_required(doc) -> bool:
    if doc.document_type == "invoice":
        return any([
            doc.amount is None,
            doc.document_date is None,
            doc.document_time is None,
            not doc.invoice_number,
        ])
    else:  # receipt
        return any([
            doc.amount is None,
            doc.document_date is None,
            doc.document_time is None,
        ])


def _check_low_confidence(doc, cfg) -> bool:
    checks = [
        (doc.amount_confidence, cfg.ocr_confidence_amount),
        (doc.date_confidence, cfg.ocr_confidence_date),
        (doc.time_confidence, cfg.ocr_confidence_time),
    ]
    for conf, threshold in checks:
        if conf is not None and conf < threshold:
            return True
    if doc.document_type == "invoice" and doc.invoice_number_confidence is not None:
        if doc.invoice_number_confidence < cfg.ocr_confidence_invoice_number:
            return True
    return False


@celery_app.task(bind=True, max_retries=2)
def generate_pdf(self, package_id: str):
    """Generate a PDF for an export package and store it in S3."""
    from ..database import SessionLocal
    from ..models import ExportPackage
    from ..services.pdf import generate_package_pdf
    from ..services import storage as store
    from ..config import get_settings

    cfg = get_settings()
    db = SessionLocal()
    try:
        package = db.query(ExportPackage).get(package_id)
        if not package:
            return

        pdf_bytes = generate_package_pdf(db, package, company_name=cfg.company_name)
        pdf_key = f"packages/{package_id}/package.pdf"
        store.upload_file(pdf_bytes, pdf_key, content_type="application/pdf")

        package.pdf_url = pdf_key
        package.status = "ready"
        db.commit()

    except Exception as exc:
        db = SessionLocal()
        pkg = db.query(ExportPackage).get(package_id)
        if pkg:
            pkg.status = "failed"
            db.commit()
        db.close()
        raise self.retry(exc=exc)
    finally:
        db.close()
