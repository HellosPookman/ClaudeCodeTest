from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db
from ..models import AuditLog, AppSettings, User
from ..schemas import (
    SettingsOut, SettingsUpdate, AuditLogOut, UserOut, UserUpdate
)
from ..auth.utils import get_current_user, require_role
from ..config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])
base_settings = get_settings()

_DEFAULT_SETTINGS = {
    "amount_tolerance_fixed": str(base_settings.amount_tolerance_fixed),
    "amount_tolerance_pct": str(base_settings.amount_tolerance_pct),
    "ocr_confidence_amount": str(base_settings.ocr_confidence_amount),
    "ocr_confidence_date": str(base_settings.ocr_confidence_date),
    "ocr_confidence_time": str(base_settings.ocr_confidence_time),
    "ocr_confidence_invoice_number": str(base_settings.ocr_confidence_invoice_number),
    "batch_upload_threshold": str(base_settings.batch_upload_threshold),
    "retention_days": str(base_settings.retention_days),
    "company_name": base_settings.company_name,
}


def _get_setting(db: Session, key: str) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else _DEFAULT_SETTINGS.get(key, "")


def _load_settings(db: Session) -> SettingsOut:
    return SettingsOut(
        amount_tolerance_fixed=float(_get_setting(db, "amount_tolerance_fixed")),
        amount_tolerance_pct=float(_get_setting(db, "amount_tolerance_pct")),
        ocr_confidence_amount=float(_get_setting(db, "ocr_confidence_amount")),
        ocr_confidence_date=float(_get_setting(db, "ocr_confidence_date")),
        ocr_confidence_time=float(_get_setting(db, "ocr_confidence_time")),
        ocr_confidence_invoice_number=float(_get_setting(db, "ocr_confidence_invoice_number")),
        batch_upload_threshold=int(_get_setting(db, "batch_upload_threshold")),
        retention_days=int(_get_setting(db, "retention_days")),
        company_name=_get_setting(db, "company_name"),
    )


@router.get("/settings", response_model=SettingsOut)
def get_settings_endpoint(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    return _load_settings(db)


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    for key, value in body.model_dump(exclude_none=True).items():
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = str(value)
            row.updated_by = current_user.id
            row.updated_at = datetime.utcnow()
        else:
            db.add(AppSettings(key=key, value=str(value), updated_by=current_user.id))

    db.add(AuditLog(
        actor_user_id=current_user.id,
        entity_type="settings",
        entity_id="00000000-0000-0000-0000-000000000000",
        action="update_settings",
        metadata=body.model_dump(exclude_none=True),
    ))
    db.commit()
    return _load_settings(db)


@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    return q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(user, field, val)
    db.commit()
    db.refresh(user)
    return user


@router.post("/archive/run-retention")
def run_retention(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Archive documents older than retention_days."""
    from datetime import timedelta
    from ..models import Document
    retention = int(_get_setting(db, "retention_days"))
    cutoff = datetime.utcnow() - timedelta(days=retention)
    docs = db.query(Document).filter(
        Document.uploaded_at < cutoff,
        Document.status.in_(["Exported", "Confirmed"]),
        Document.archived_at.is_(None),
    ).all()
    for doc in docs:
        doc.status = "Archived"
        doc.archived_at = datetime.utcnow()
    db.commit()
    return {"archived": len(docs)}
