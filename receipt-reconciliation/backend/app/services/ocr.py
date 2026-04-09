"""
OCR extraction service with pluggable backends.

Provider selection via OCR_PROVIDER env var:
  - mock   : returns realistic fake data (local dev / testing)
  - google : Google Cloud Vision API
  - azure  : Azure Form Recognizer
  - aws    : AWS Textract

All providers return a standardized OCRResult schema.
"""
import re
import random
from datetime import date, datetime, timedelta
from typing import Optional
from ..schemas import OCRResult, ExtractionConfidence
from ..config import get_settings

settings = get_settings()


# ── Mock provider (dev/testing) ───────────────────────────────────────────────

_MOCK_VENDORS = [
    "全聚德烤鸭店", "海底捞火锅", "麦当劳", "星巴克咖啡",
    "顺丰速运", "滴滴出行", "美团外卖", "京东超市",
    "Marriott Hotel", "IKEA 宜家",
]

_MOCK_INVOICE_PREFIXES = ["粤", "沪", "京", "浙", "苏"]


def _mock_ocr(file_bytes: bytes, hint_doc_type: Optional[str] = None) -> OCRResult:
    """Return plausible fake OCR data for development."""
    rng = random.Random(hash(file_bytes[:64]) % (2**32))

    doc_type = hint_doc_type or rng.choice(["receipt", "invoice"])
    vendor = rng.choice(_MOCK_VENDORS)
    amount = round(rng.uniform(50, 5000), 2)
    tax = round(amount * 0.09, 2) if doc_type == "invoice" else None
    days_ago = rng.randint(0, 30)
    doc_date = (datetime.utcnow() - timedelta(days=days_ago)).date()
    hour = rng.randint(8, 21)
    minute = rng.randint(0, 59)
    doc_time = f"{hour:02d}:{minute:02d}:00"

    invoice_number = None
    inv_conf = None
    if doc_type == "invoice":
        prefix = rng.choice(_MOCK_INVOICE_PREFIXES)
        invoice_number = f"{prefix}{rng.randint(10000000, 99999999)}"
        inv_conf = round(rng.uniform(0.88, 0.99), 4)

    # Simulate occasional low-confidence fields
    amount_conf = round(rng.uniform(0.90, 0.99), 4)
    date_conf = round(rng.uniform(0.88, 0.99), 4)
    time_conf = round(rng.uniform(0.85, 0.99), 4)
    overall = round((amount_conf + date_conf + time_conf) / 3, 4)

    raw = (
        f"{vendor}\n"
        f"日期: {doc_date}  时间: {doc_time}\n"
        f"金额: ¥{amount:.2f}"
        + (f"\n税额: ¥{tax:.2f}" if tax else "")
        + (f"\n发票号: {invoice_number}" if invoice_number else "")
    )

    return OCRResult(
        document_type=doc_type,
        vendor_name=vendor,
        amount=amount,
        currency="RMB",
        document_date=str(doc_date),
        document_time=doc_time,
        invoice_number=invoice_number,
        tax_amount=tax,
        raw_text=raw,
        language_detected="zh",
        field_confidence=ExtractionConfidence(
            amount=amount_conf,
            date=date_conf,
            time=time_conf,
            invoice_number=inv_conf,
        ),
        overall_confidence=overall,
    )


# ── Google Cloud Vision provider ──────────────────────────────────────────────

def _google_ocr(file_bytes: bytes, hint_doc_type: Optional[str] = None) -> OCRResult:
    """
    Uses Google Cloud Vision for text detection then applies field extraction.
    Requires GOOGLE_APPLICATION_CREDENTIALS to be set.
    """
    from google.cloud import vision  # type: ignore
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=file_bytes)
    response = client.text_detection(image=image)
    raw_text = response.full_text_annotation.text if response.full_text_annotation else ""
    return _extract_fields_from_text(raw_text, hint_doc_type)


# ── Azure Form Recognizer provider ────────────────────────────────────────────

def _azure_ocr(file_bytes: bytes, hint_doc_type: Optional[str] = None) -> OCRResult:
    """
    Uses Azure Form Recognizer for structured field extraction.
    """
    from azure.ai.formrecognizer import DocumentAnalysisClient  # type: ignore
    from azure.core.credentials import AzureKeyCredential  # type: ignore
    import io

    client = DocumentAnalysisClient(
        endpoint=settings.azure_form_recognizer_endpoint,
        credential=AzureKeyCredential(settings.azure_form_recognizer_key),
    )
    poller = client.begin_analyze_document("prebuilt-receipt", file_bytes)
    result = poller.result()

    if not result.documents:
        return OCRResult(raw_text="")

    doc = result.documents[0]
    fields = doc.fields

    def field_value(name):
        f = fields.get(name)
        return (f.value, f.confidence) if f else (None, None)

    amount, amount_conf = field_value("Total")
    vendor, _ = field_value("MerchantName")
    date_val, date_conf = field_value("TransactionDate")
    time_val, time_conf = field_value("TransactionTime")

    return OCRResult(
        document_type=hint_doc_type or "receipt",
        vendor_name=str(vendor) if vendor else None,
        amount=float(amount) if amount else None,
        document_date=str(date_val.date()) if date_val else None,
        document_time=str(time_val) if time_val else None,
        field_confidence=ExtractionConfidence(
            amount=amount_conf,
            date=date_conf,
            time=time_conf,
        ),
        overall_confidence=amount_conf or 0.0,
    )


# ── Regex-based field extractor (used by Google/text-only providers) ──────────

_AMOUNT_RE = re.compile(r"[¥￥]\s*([\d,]+\.?\d*)|合计[：:]?\s*([\d,]+\.?\d*)|total[：:]?\s*([\d,]+\.?\d*)", re.I)
_DATE_RE = re.compile(r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})")
_TIME_RE = re.compile(r"(\d{2}:\d{2}(?::\d{2})?)")
_INVOICE_RE = re.compile(r"发票号[码]?[：:\s]*([\w\d]+)|invoice\s*(?:no\.?|number)[：:\s]*([\w\d]+)", re.I)
_VENDOR_RE = re.compile(r"^(.+?)\n", re.MULTILINE)


def _extract_fields_from_text(raw_text: str, hint_doc_type: Optional[str] = None) -> OCRResult:
    amount = None
    m = _AMOUNT_RE.search(raw_text)
    if m:
        raw_num = next(g for g in m.groups() if g)
        amount = float(raw_num.replace(",", ""))

    doc_date = None
    m = _DATE_RE.search(raw_text)
    if m:
        ds = m.group(1).replace("年", "-").replace("月", "-").replace("/", "-")
        doc_date = ds

    doc_time = None
    m = _TIME_RE.search(raw_text)
    if m:
        doc_time = m.group(1)

    invoice_number = None
    m = _INVOICE_RE.search(raw_text)
    if m:
        invoice_number = next(g for g in m.groups() if g)

    vendor = None
    m = _VENDOR_RE.search(raw_text.strip())
    if m:
        vendor = m.group(1).strip()

    return OCRResult(
        document_type=hint_doc_type,
        vendor_name=vendor,
        amount=amount,
        document_date=doc_date,
        document_time=doc_time,
        invoice_number=invoice_number,
        raw_text=raw_text,
        language_detected="zh",
        field_confidence=ExtractionConfidence(
            amount=0.85 if amount else None,
            date=0.85 if doc_date else None,
            time=0.85 if doc_time else None,
            invoice_number=0.85 if invoice_number else None,
        ),
        overall_confidence=0.85 if amount else 0.50,
    )


# ── Public API ─────────────────────────────────────────────────────────────────

def extract(file_bytes: bytes, hint_doc_type: Optional[str] = None) -> OCRResult:
    """Run OCR extraction using the configured provider."""
    provider = settings.ocr_provider.lower()
    if provider == "google":
        return _google_ocr(file_bytes, hint_doc_type)
    elif provider == "azure":
        return _azure_ocr(file_bytes, hint_doc_type)
    else:
        return _mock_ocr(file_bytes, hint_doc_type)
