from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Match, Document, MatchWarning, AuditLog
from ..schemas import MatchOut, MatchRejectRequest, BulkActionRequest
from ..auth.utils import get_current_user, require_role

router = APIRouter(prefix="/matches", tags=["matches"])


def _log(db, user_id, entity_id, action, metadata=None):
    db.add(AuditLog(actor_user_id=user_id, entity_type="match",
                    entity_id=entity_id, action=action, metadata=metadata))


def _get_match_or_404(db, match_id) -> Match:
    m = db.query(Match).get(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return m


@router.post("/run")
def run_matching(
    document_ids: Optional[List[str]] = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    """Trigger the matching engine for pending documents."""
    from ..services.matching import run_matching as _run
    count = _run(db, document_ids=document_ids)
    return {"matches_created": count}


@router.get("", response_model=List[MatchOut])
def list_matches(
    status: Optional[str] = Query(None),
    confidence_level: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Match)
    if status:
        q = q.filter(Match.status == status)
    if confidence_level:
        q = q.filter(Match.confidence_level == confidence_level)
    matches = q.order_by(Match.created_at.desc()).offset(offset).limit(limit).all()

    # Eagerly attach document summaries
    results = []
    for m in matches:
        receipt = db.query(Document).get(m.receipt_document_id)
        invoice = db.query(Document).get(m.invoice_document_id)
        obj = MatchOut.model_validate(m)
        obj.receipt = receipt
        obj.invoice = invoice
        results.append(obj)
    return results


@router.get("/needs-review", response_model=List[MatchOut])
def needs_review_queue(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    matches = db.query(Match).filter(
        Match.status.in_(["Suggested", "Needs Review"])
    ).order_by(Match.match_score.desc()).all()
    results = []
    for m in matches:
        obj = MatchOut.model_validate(m)
        obj.receipt = db.query(Document).get(m.receipt_document_id)
        obj.invoice = db.query(Document).get(m.invoice_document_id)
        results.append(obj)
    return results


@router.get("/pending-approval", response_model=List[MatchOut])
def pending_approval_queue(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("approver", "admin")),
):
    matches = db.query(Match).filter(
        Match.status.in_(["Manually Confirmed", "Auto-Confirmed"])
    ).order_by(Match.confirmed_at.desc()).all()
    results = []
    for m in matches:
        obj = MatchOut.model_validate(m)
        obj.receipt = db.query(Document).get(m.receipt_document_id)
        obj.invoice = db.query(Document).get(m.invoice_document_id)
        results.append(obj)
    return results


@router.get("/{match_id}", response_model=MatchOut)
def get_match(
    match_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    m = _get_match_or_404(db, match_id)
    obj = MatchOut.model_validate(m)
    obj.receipt = db.query(Document).get(m.receipt_document_id)
    obj.invoice = db.query(Document).get(m.invoice_document_id)
    return obj


@router.post("/{match_id}/confirm", response_model=MatchOut)
def confirm_match(
    match_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    m = _get_match_or_404(db, match_id)
    if m.status not in ("Suggested", "Needs Review"):
        raise HTTPException(status_code=400, detail=f"Cannot confirm match in status '{m.status}'")
    m.status = "Manually Confirmed"
    m.confirmed_by = current_user.id
    m.confirmed_at = datetime.utcnow()

    for doc_id in [m.receipt_document_id, m.invoice_document_id]:
        doc = db.query(Document).get(doc_id)
        if doc:
            doc.status = "Confirmed"
            doc.reviewed_by = current_user.id
            doc.reviewed_at = datetime.utcnow()

    _log(db, current_user.id, match_id, "confirm")
    db.commit()
    db.refresh(m)
    return m


@router.post("/{match_id}/reject", response_model=MatchOut)
def reject_match(
    match_id: str,
    body: MatchRejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    m = _get_match_or_404(db, match_id)
    if m.status in ("Approved", "Exported"):
        raise HTTPException(status_code=400, detail=f"Cannot reject match in status '{m.status}'")
    m.status = "Rejected"
    m.rejection_reason = body.reason

    for doc_id in [m.receipt_document_id, m.invoice_document_id]:
        doc = db.query(Document).get(doc_id)
        if doc:
            doc.status = "Extracted"  # Return to pool for re-matching

    _log(db, current_user.id, match_id, "reject", {"reason": body.reason})
    db.commit()
    db.refresh(m)
    return m


@router.post("/{match_id}/approve", response_model=MatchOut)
def approve_match(
    match_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("approver", "admin")),
):
    m = _get_match_or_404(db, match_id)
    if m.status not in ("Manually Confirmed", "Auto-Confirmed"):
        raise HTTPException(status_code=400, detail=f"Cannot approve match in status '{m.status}'")
    m.status = "Approved"
    m.approved_by = current_user.id
    m.approved_at = datetime.utcnow()

    for doc_id in [m.receipt_document_id, m.invoice_document_id]:
        doc = db.query(Document).get(doc_id)
        if doc:
            doc.status = "Approved"
            doc.approved_by = current_user.id
            doc.approved_at = datetime.utcnow()

    _log(db, current_user.id, match_id, "approve")
    db.commit()
    db.refresh(m)
    return m


@router.post("/{match_id}/finance-reject", response_model=MatchOut)
def finance_reject_match(
    match_id: str,
    body: MatchRejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("approver", "admin")),
):
    m = _get_match_or_404(db, match_id)
    m.status = "Rejected"
    m.rejection_reason = body.reason
    _log(db, current_user.id, match_id, "finance_reject", {"reason": body.reason})
    db.commit()
    db.refresh(m)
    return m


# ── Bulk actions ──────────────────────────────────────────────────────────────

@router.post("/bulk-confirm")
def bulk_confirm(
    body: BulkActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    confirmed = []
    for mid in body.match_ids:
        m = db.query(Match).get(mid)
        if m and m.status in ("Suggested", "Needs Review"):
            m.status = "Manually Confirmed"
            m.confirmed_by = current_user.id
            m.confirmed_at = datetime.utcnow()
            confirmed.append(mid)
    _log(db, current_user.id, "bulk", "bulk_confirm", {"count": len(confirmed)})
    db.commit()
    return {"confirmed": confirmed}


@router.post("/bulk-reject")
def bulk_reject(
    body: BulkActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("reviewer", "admin")),
):
    rejected = []
    for mid in body.match_ids:
        m = db.query(Match).get(mid)
        if m and m.status not in ("Approved", "Exported"):
            m.status = "Rejected"
            m.rejection_reason = body.reason or "Bulk rejected"
            rejected.append(mid)
    _log(db, current_user.id, "bulk", "bulk_reject", {"count": len(rejected)})
    db.commit()
    return {"rejected": rejected}
