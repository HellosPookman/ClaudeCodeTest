from typing import List
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from ..database import get_db
from ..models import ExportPackage, ExportPackageItem, Match, Document, AuditLog
from ..schemas import PackageCreateRequest, PackageOut
from ..auth.utils import get_current_user, require_role
from ..config import get_settings

router = APIRouter(prefix="/packages", tags=["packages"])
settings = get_settings()


def _log(db, user_id, entity_id, action, metadata=None):
    db.add(AuditLog(actor_user_id=user_id, entity_type="package",
                    entity_id=entity_id, action=action, metadata=metadata))


@router.post("", response_model=PackageOut)
def create_package(
    body: PackageCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    """Create an export package from a selection of approved match IDs."""
    # Validate all matches are Approved or Auto-Confirmed
    total_amount = 0.0
    valid_matches = []
    for mid in body.match_ids:
        m = db.query(Match).get(mid)
        if not m:
            raise HTTPException(status_code=404, detail=f"Match {mid} not found")
        if m.status not in ("Approved", "Auto-Confirmed", "Manually Confirmed"):
            raise HTTPException(
                status_code=400,
                detail=f"Match {mid} is in status '{m.status}' and cannot be exported. Only Approved or Confirmed matches may be exported.",
            )
        valid_matches.append(m)
        invoice = db.query(Document).get(m.invoice_document_id)
        if invoice and invoice.amount:
            total_amount += float(invoice.amount)

    package_name = body.package_name or (
        f"Expense_Package_{date.today().isoformat()}_{current_user.name.replace(' ', '_')}"
    )

    package = ExportPackage(
        package_name=package_name,
        created_by=current_user.id,
        status="generating",
        total_pairs=len(valid_matches),
        total_amount=round(total_amount, 2),
    )
    db.add(package)
    db.flush()

    for page_num, m in enumerate(valid_matches, 2):
        db.add(ExportPackageItem(
            package_id=package.id,
            match_id=m.id,
            page_number=page_num,
        ))
        m.status = "Exported"
        for doc_id in [m.receipt_document_id, m.invoice_document_id]:
            doc = db.query(Document).get(doc_id)
            if doc:
                doc.status = "Exported"

    _log(db, current_user.id, package.id, "create_package",
         {"total_pairs": package.total_pairs, "total_amount": float(total_amount)})
    db.commit()
    db.refresh(package)

    # Queue PDF generation
    from ..workers.tasks import generate_pdf
    generate_pdf.delay(package.id)

    return package


@router.get("", response_model=List[PackageOut])
def list_packages(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return db.query(ExportPackage).order_by(ExportPackage.created_at.desc()).all()


@router.get("/{package_id}", response_model=PackageOut)
def get_package(
    package_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    package = db.query(ExportPackage).get(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@router.post("/{package_id}/generate-pdf")
def regenerate_pdf(
    package_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    package = db.query(ExportPackage).get(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    package.status = "generating"
    db.commit()
    from ..workers.tasks import generate_pdf
    generate_pdf.delay(package_id)
    return {"detail": "PDF generation queued"}


@router.get("/{package_id}/download")
def download_package(
    package_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    package = db.query(ExportPackage).get(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    if package.status != "ready" or not package.pdf_url:
        raise HTTPException(status_code=202, detail="PDF is not ready yet")

    from ..services import storage as store
    pdf_bytes = store.download_file(package.pdf_url)
    _log(db, current_user.id, package_id, "download")
    db.commit()

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{package.package_name}.pdf"'},
    )
