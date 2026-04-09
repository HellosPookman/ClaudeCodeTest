from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date, time
from decimal import Decimal


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "reviewer"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# ── Document ──────────────────────────────────────────────────────────────────

class ExtractionConfidence(BaseModel):
    amount: Optional[float] = None
    date: Optional[float] = None
    time: Optional[float] = None
    invoice_number: Optional[float] = None

class DocumentOut(BaseModel):
    id: str
    document_type: str
    source_type: str
    original_file_name: Optional[str]
    mime_type: Optional[str]
    file_url: str
    thumbnail_url: Optional[str]
    language_detected: Optional[str]
    vendor_name: Optional[str]
    amount: Optional[Decimal]
    currency: Optional[str]
    document_date: Optional[date]
    document_time: Optional[time]
    invoice_number: Optional[str]
    tax_amount: Optional[Decimal]
    extraction_confidence: Optional[float]
    amount_confidence: Optional[float]
    date_confidence: Optional[float]
    time_confidence: Optional[float]
    invoice_number_confidence: Optional[float]
    duplicate_type: Optional[str]
    status: str
    uploaded_by: str
    reviewed_by: Optional[str]
    uploaded_at: datetime
    reviewed_at: Optional[datetime]
    approved_at: Optional[datetime]

    class Config:
        from_attributes = True

class DocumentListItem(BaseModel):
    id: str
    document_type: str
    original_file_name: Optional[str]
    thumbnail_url: Optional[str]
    vendor_name: Optional[str]
    amount: Optional[Decimal]
    currency: Optional[str]
    document_date: Optional[date]
    invoice_number: Optional[str]
    status: str
    duplicate_type: Optional[str]
    uploaded_at: datetime

    class Config:
        from_attributes = True

class DocumentFieldUpdate(BaseModel):
    vendor_name: Optional[str] = None
    amount: Optional[Decimal] = None
    document_date: Optional[date] = None
    document_time: Optional[time] = None
    invoice_number: Optional[str] = None
    tax_amount: Optional[Decimal] = None
    reason: Optional[str] = None

class FieldEditOut(BaseModel):
    id: str
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    edited_at: datetime
    reason: Optional[str]

    class Config:
        from_attributes = True


# ── Match ─────────────────────────────────────────────────────────────────────

class MatchWarningOut(BaseModel):
    id: str
    warning_type: str
    warning_message: str
    severity: str

    class Config:
        from_attributes = True

class MatchOut(BaseModel):
    id: str
    receipt_document_id: str
    invoice_document_id: str
    amount_difference: Optional[Decimal]
    allowed_difference: Optional[Decimal]
    vendor_similarity: Optional[float]
    time_difference_minutes: Optional[int]
    match_score: Optional[Decimal]
    confidence_level: Optional[str]
    status: str
    auto_confirmed: bool
    confirmed_by: Optional[str]
    approved_by: Optional[str]
    rejection_reason: Optional[str]
    created_at: datetime
    confirmed_at: Optional[datetime]
    approved_at: Optional[datetime]
    warnings: List[MatchWarningOut] = []
    receipt: Optional[DocumentListItem] = None
    invoice: Optional[DocumentListItem] = None

    class Config:
        from_attributes = True

class MatchRejectRequest(BaseModel):
    reason: str

class BulkActionRequest(BaseModel):
    match_ids: List[str]
    reason: Optional[str] = None


# ── Export Packages ───────────────────────────────────────────────────────────

class PackageCreateRequest(BaseModel):
    package_name: Optional[str] = None  # auto-generated if omitted
    match_ids: List[str]

class PackageItemOut(BaseModel):
    id: str
    match_id: str
    page_number: Optional[int]

    class Config:
        from_attributes = True

class PackageOut(BaseModel):
    id: str
    package_name: str
    pdf_url: Optional[str]
    created_by: str
    created_at: datetime
    status: str
    total_pairs: int
    total_amount: Optional[Decimal]
    items: List[PackageItemOut] = []

    class Config:
        from_attributes = True


# ── Admin ─────────────────────────────────────────────────────────────────────

class SettingsOut(BaseModel):
    amount_tolerance_fixed: float
    amount_tolerance_pct: float
    ocr_confidence_amount: float
    ocr_confidence_date: float
    ocr_confidence_time: float
    ocr_confidence_invoice_number: float
    batch_upload_threshold: int
    retention_days: int
    company_name: str

class SettingsUpdate(BaseModel):
    amount_tolerance_fixed: Optional[float] = None
    amount_tolerance_pct: Optional[float] = None
    ocr_confidence_amount: Optional[float] = None
    ocr_confidence_date: Optional[float] = None
    ocr_confidence_time: Optional[float] = None
    ocr_confidence_invoice_number: Optional[float] = None
    batch_upload_threshold: Optional[int] = None
    retention_days: Optional[int] = None
    company_name: Optional[str] = None

class AuditLogOut(BaseModel):
    id: str
    actor_user_id: Optional[str]
    entity_type: str
    entity_id: str
    action: str
    metadata: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


# ── OCR Result (internal) ─────────────────────────────────────────────────────

class OCRResult(BaseModel):
    document_type: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "RMB"
    document_date: Optional[str] = None   # ISO date string
    document_time: Optional[str] = None   # HH:MM:SS
    invoice_number: Optional[str] = None
    tax_amount: Optional[float] = None
    raw_text: str = ""
    language_detected: str = "zh"
    field_confidence: ExtractionConfidence = Field(default_factory=ExtractionConfidence)
    overall_confidence: float = 0.0
