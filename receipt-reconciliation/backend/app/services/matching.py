"""
Matching engine: proposes one-to-one receipt↔invoice matches.

Scoring weights (spec §12.2):
  amount:         45%
  time:           20%
  vendor:         15%
  invoice number: 15%
  tax:             5%

Auto-confirm threshold: >= 90 with all critical checks passing (spec §12.3).
"""
from datetime import datetime, date, time, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from ..models import Document, Match, MatchWarning, AuditLog
from ..config import get_settings

settings = get_settings()


# ── Scoring helpers ───────────────────────────────────────────────────────────

def _amount_score(receipt_amount: float, invoice_amount: float, settings) -> Tuple[float, float, float]:
    """
    Returns (score 0-100, amount_difference, allowed_difference).
    """
    allowed = max(settings.amount_tolerance_fixed, invoice_amount * settings.amount_tolerance_pct)
    diff = abs(receipt_amount - invoice_amount)
    if diff <= allowed:
        # Scale: perfect match = 100, tolerance boundary = 60
        score = max(60.0, 100.0 - (diff / allowed) * 40.0)
    else:
        # Proportional penalty beyond tolerance
        over_ratio = (diff - allowed) / allowed
        score = max(0.0, 60.0 - over_ratio * 60.0)
    return round(score, 2), round(diff, 2), round(allowed, 2)


def _time_score(receipt_dt: Optional[datetime], invoice_dt: Optional[datetime]) -> Tuple[float, Optional[int]]:
    """Returns (score 0-100, difference_in_minutes)."""
    if not receipt_dt or not invoice_dt:
        return 50.0, None  # neutral when missing
    delta_minutes = abs((receipt_dt - invoice_dt).total_seconds() / 60)
    if delta_minutes <= 60:
        score = 100.0
    elif delta_minutes <= 24 * 60:
        score = max(70.0, 100.0 - (delta_minutes - 60) / (23 * 60) * 30.0)
    elif delta_minutes <= 7 * 24 * 60:
        score = max(40.0, 70.0 - (delta_minutes - 1440) / (6 * 1440) * 30.0)
    else:
        score = 0.0
    return round(score, 2), int(delta_minutes)


def _vendor_score(v1: Optional[str], v2: Optional[str]) -> float:
    if not v1 or not v2:
        return 50.0  # neutral
    from fuzzywuzzy import fuzz  # type: ignore
    return float(fuzz.token_sort_ratio(v1.lower(), v2.lower()))


def _invoice_number_score(r_num: Optional[str], i_num: Optional[str]) -> float:
    if not r_num or not i_num:
        return 50.0  # neutral — receipts often don't carry invoice number
    return 100.0 if r_num.strip() == i_num.strip() else 0.0


def _tax_score(r_tax: Optional[float], i_tax: Optional[float]) -> float:
    if r_tax is None or i_tax is None:
        return 50.0
    if abs(r_tax - i_tax) < 0.01:
        return 100.0
    return max(0.0, 100.0 - abs(r_tax - i_tax) / max(i_tax, 0.01) * 100)


def _combine_datetime(d: Optional[date], t: Optional[time]) -> Optional[datetime]:
    if not d:
        return None
    return datetime.combine(d, t or time(0, 0))


# ── Warning generation ────────────────────────────────────────────────────────

def _build_warnings(receipt: Document, invoice: Document, amount_score: float,
                    amount_diff: float, allowed_diff: float, time_diff_minutes: Optional[int],
                    vendor_sim: float, cfg) -> List[dict]:
    warnings = []

    if amount_diff > allowed_diff:
        warnings.append({
            "type": "amount_mismatch",
            "message": f"Amount difference ¥{amount_diff:.2f} exceeds allowed ¥{allowed_diff:.2f}",
            "severity": "critical",
        })

    for doc, role in [(receipt, "Receipt"), (invoice, "Invoice")]:
        if doc.amount_confidence and doc.amount_confidence < cfg.ocr_confidence_amount:
            warnings.append({
                "type": "low_ocr_confidence",
                "message": f"{role} amount confidence {doc.amount_confidence:.0%} below threshold",
                "severity": "warning",
            })
        if doc.date_confidence and doc.date_confidence < cfg.ocr_confidence_date:
            warnings.append({
                "type": "low_ocr_confidence",
                "message": f"{role} date confidence {doc.date_confidence:.0%} below threshold",
                "severity": "warning",
            })
        if doc.invoice_number_confidence and doc.invoice_number_confidence < cfg.ocr_confidence_invoice_number:
            warnings.append({
                "type": "low_ocr_confidence",
                "message": f"{role} invoice number confidence {doc.invoice_number_confidence:.0%} below threshold",
                "severity": "warning",
            })

    if invoice.duplicate_type:
        warnings.append({
            "type": "duplicate_invoice",
            "message": f"Invoice flagged as duplicate: {invoice.duplicate_type}",
            "severity": "critical",
        })

    if receipt.duplicate_type:
        warnings.append({
            "type": "duplicate_invoice",
            "message": f"Receipt flagged as duplicate: {receipt.duplicate_type}",
            "severity": "warning",
        })

    if vendor_sim < 70 and receipt.vendor_name and invoice.vendor_name:
        warnings.append({
            "type": "ambiguous_vendor",
            "message": f"Vendor names differ: '{receipt.vendor_name}' vs '{invoice.vendor_name}'",
            "severity": "info",
        })

    if time_diff_minutes and time_diff_minutes > 24 * 60:
        warnings.append({
            "type": "time_mismatch",
            "message": f"Documents are {time_diff_minutes // 60} hours apart",
            "severity": "warning",
        })

    return warnings


# ── Auto-confirm eligibility ──────────────────────────────────────────────────

def _can_auto_confirm(receipt: Document, invoice: Document, score: float,
                      amount_diff: float, allowed_diff: float, warnings: List[dict],
                      cfg) -> bool:
    if score < 90:
        return False
    critical_warnings = [w for w in warnings if w["severity"] == "critical"]
    if critical_warnings:
        return False
    for doc in [receipt, invoice]:
        if doc.amount is None or doc.document_date is None or doc.document_time is None:
            return False
        if doc.duplicate_type:
            return False
        for conf_attr, threshold in [
            ("amount_confidence", cfg.ocr_confidence_amount),
            ("date_confidence", cfg.ocr_confidence_date),
            ("time_confidence", cfg.ocr_confidence_time),
        ]:
            val = getattr(doc, conf_attr)
            if val is not None and val < threshold:
                return False
    if invoice.invoice_number is None:
        return False
    if invoice.invoice_number_confidence and invoice.invoice_number_confidence < cfg.ocr_confidence_invoice_number:
        return False
    if amount_diff > allowed_diff:
        return False
    return True


# ── Main matching function ────────────────────────────────────────────────────

def run_matching(db: Session, document_ids: Optional[List[str]] = None):
    """
    For each unmatched receipt, find the best unmatched invoice candidate.
    Creates or updates Match records. Returns number of matches created/updated.
    """
    cfg = settings

    # Load unmatched receipts
    receipt_q = db.query(Document).filter(
        Document.document_type == "receipt",
        Document.is_deleted == False,
        Document.status.in_(["Extracted", "Needs Review", "Low Confidence"]),
    )
    if document_ids:
        receipt_q = receipt_q.filter(Document.id.in_(document_ids))
    receipts = receipt_q.all()

    # Load all unmatched invoices
    matched_invoice_ids = {
        m.invoice_document_id
        for m in db.query(Match).filter(
            Match.status.notin_(["Rejected"])
        ).all()
    }
    invoices = db.query(Document).filter(
        Document.document_type == "invoice",
        Document.is_deleted == False,
        Document.status.in_(["Extracted", "Needs Review", "Low Confidence"]),
        Document.id.notin_(matched_invoice_ids),
    ).all()

    matched_receipt_ids = {
        m.receipt_document_id
        for m in db.query(Match).filter(
            Match.status.notin_(["Rejected"])
        ).all()
    }

    created = 0
    for receipt in receipts:
        if receipt.id in matched_receipt_ids:
            continue
        if receipt.amount is None:
            continue

        best_score = -1.0
        best_match_data = None

        for invoice in invoices:
            if invoice.amount is None:
                continue

            # Scoring
            a_score, a_diff, a_allowed = _amount_score(float(receipt.amount), float(invoice.amount), cfg)
            r_dt = _combine_datetime(receipt.document_date, receipt.document_time)
            i_dt = _combine_datetime(invoice.document_date, invoice.document_time)
            t_score, t_diff_min = _time_score(r_dt, i_dt)
            v_score = _vendor_score(receipt.vendor_name, invoice.vendor_name)
            inv_score = _invoice_number_score(receipt.invoice_number, invoice.invoice_number)
            tax_score = _tax_score(
                float(receipt.tax_amount) if receipt.tax_amount else None,
                float(invoice.tax_amount) if invoice.tax_amount else None,
            )

            total_score = (
                a_score * 0.45 +
                t_score * 0.20 +
                v_score * 0.15 +
                inv_score * 0.15 +
                tax_score * 0.05
            )

            if total_score < 70:
                continue

            if total_score > best_score:
                best_score = total_score
                best_match_data = {
                    "invoice": invoice,
                    "score": total_score,
                    "amount_diff": a_diff,
                    "allowed_diff": a_allowed,
                    "vendor_sim": v_score / 100,
                    "time_diff_min": t_diff_min,
                }

        if not best_match_data:
            continue

        invoice = best_match_data["invoice"]
        warnings = _build_warnings(
            receipt, invoice,
            best_match_data["score"],
            best_match_data["amount_diff"],
            best_match_data["allowed_diff"],
            best_match_data["time_diff_min"],
            best_match_data["vendor_sim"],
            cfg,
        )

        auto_ok = _can_auto_confirm(
            receipt, invoice,
            best_match_data["score"],
            best_match_data["amount_diff"],
            best_match_data["allowed_diff"],
            warnings,
            cfg,
        )

        confidence_level = (
            "high" if best_match_data["score"] >= 90 else
            "medium" if best_match_data["score"] >= 70 else "low"
        )
        match_status = "Auto-Confirmed" if auto_ok else "Suggested"

        match = Match(
            receipt_document_id=receipt.id,
            invoice_document_id=invoice.id,
            amount_difference=best_match_data["amount_diff"],
            allowed_difference=best_match_data["allowed_diff"],
            vendor_similarity=best_match_data["vendor_sim"],
            time_difference_minutes=best_match_data["time_diff_min"],
            match_score=round(best_match_data["score"], 2),
            confidence_level=confidence_level,
            status=match_status,
            auto_confirmed=auto_ok,
        )
        db.add(match)
        db.flush()

        for w in warnings:
            db.add(MatchWarning(
                match_id=match.id,
                warning_type=w["type"],
                warning_message=w["message"],
                severity=w["severity"],
            ))

        # Update document statuses
        new_status = "Matched" if match_status in ("Suggested", "Auto-Confirmed") else "Needs Review"
        receipt.status = new_status
        invoice.status = new_status

        if auto_ok:
            receipt.status = "Confirmed"
            invoice.status = "Confirmed"

        created += 1

    db.commit()
    return created
