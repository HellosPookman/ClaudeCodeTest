import uuid
from datetime import datetime, date, time
from sqlalchemy import (
    Column, String, Text, Numeric, Boolean, Integer,
    DateTime, Date, Time, ForeignKey, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(Text, nullable=False)
    email = Column(Text, unique=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)  # reviewer | approver | admin
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    document_type = Column(String(20), nullable=False)   # receipt | invoice
    source_type = Column(String(20), nullable=False)     # mobile_capture | upload
    original_file_name = Column(Text)
    mime_type = Column(Text)
    file_url = Column(Text, nullable=False)
    thumbnail_url = Column(Text)
    file_hash = Column(Text, nullable=False)
    perceptual_hash = Column(Text)
    language_detected = Column(Text)

    # Extracted fields
    vendor_name = Column(Text)
    amount = Column(Numeric(12, 2))
    currency = Column(String(10), default="RMB")
    document_date = Column(Date)
    document_time = Column(Time)
    invoice_number = Column(Text)
    tax_amount = Column(Numeric(12, 2))
    raw_ocr_text = Column(Text)

    # Confidence scores
    extraction_confidence = Column(Numeric(5, 4))
    amount_confidence = Column(Numeric(5, 4))
    date_confidence = Column(Numeric(5, 4))
    time_confidence = Column(Numeric(5, 4))
    invoice_number_confidence = Column(Numeric(5, 4))

    # Duplicate detection
    duplicate_type = Column(String(30))  # exact_file | near_image | duplicate_invoice_number | null

    # Status & workflow
    status = Column(String(30), nullable=False, default="Uploaded")
    uploaded_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    reviewed_by = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    approved_by = Column(UUID(as_uuid=False), ForeignKey("users.id"))

    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at = Column(DateTime)
    approved_at = Column(DateTime)
    archived_at = Column(DateTime)
    is_deleted = Column(Boolean, nullable=False, default=False)

    # Relationships
    uploader = relationship("User", foreign_keys=[uploaded_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    approver = relationship("User", foreign_keys=[approved_by])
    field_edits = relationship("DocumentFieldEdit", back_populates="document")


class DocumentFieldEdit(Base):
    __tablename__ = "document_field_edits"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"), nullable=False)
    field_name = Column(Text, nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    edited_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    edited_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reason = Column(Text)

    document = relationship("Document", back_populates="field_edits")
    editor = relationship("User", foreign_keys=[edited_by])


class Match(Base):
    __tablename__ = "matches"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    receipt_document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"), nullable=False)
    invoice_document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"), nullable=False)

    # Scoring
    amount_difference = Column(Numeric(12, 2))
    allowed_difference = Column(Numeric(12, 2))
    vendor_similarity = Column(Numeric(5, 4))
    time_difference_minutes = Column(Integer)
    match_score = Column(Numeric(5, 2))
    confidence_level = Column(String(20))  # high | medium | low

    # Status & workflow
    status = Column(String(30), nullable=False)
    auto_confirmed = Column(Boolean, nullable=False, default=False)
    confirmed_by = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    approved_by = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    rejection_reason = Column(Text)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    confirmed_at = Column(DateTime)
    approved_at = Column(DateTime)

    # Relationships
    receipt = relationship("Document", foreign_keys=[receipt_document_id])
    invoice = relationship("Document", foreign_keys=[invoice_document_id])
    confirmer = relationship("User", foreign_keys=[confirmed_by])
    approver = relationship("User", foreign_keys=[approved_by])
    warnings = relationship("MatchWarning", back_populates="match")


class MatchWarning(Base):
    __tablename__ = "match_warnings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    match_id = Column(UUID(as_uuid=False), ForeignKey("matches.id"), nullable=False)
    warning_type = Column(String(50), nullable=False)
    warning_message = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)  # info | warning | critical
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    match = relationship("Match", back_populates="warnings")


class ExportPackage(Base):
    __tablename__ = "export_packages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    package_name = Column(Text, nullable=False)
    pdf_url = Column(Text)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(30), nullable=False, default="generating")  # generating | ready | failed
    total_pairs = Column(Integer, nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), default=0)

    creator = relationship("User", foreign_keys=[created_by])
    items = relationship("ExportPackageItem", back_populates="package")


class ExportPackageItem(Base):
    __tablename__ = "export_package_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    package_id = Column(UUID(as_uuid=False), ForeignKey("export_packages.id"), nullable=False)
    match_id = Column(UUID(as_uuid=False), ForeignKey("matches.id"), nullable=False)
    page_number = Column(Integer)

    package = relationship("ExportPackage", back_populates="items")
    match = relationship("Match")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    actor_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    entity_type = Column(String(30), nullable=False)  # document | match | package | settings
    entity_id = Column(UUID(as_uuid=False), nullable=False)
    action = Column(String(50), nullable=False)
    metadata = Column(JSON)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    actor = relationship("User", foreign_keys=[actor_user_id])


class AppSettings(Base):
    """Key-value store for admin-configurable settings."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_by = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    updated_at = Column(DateTime, default=datetime.utcnow)
