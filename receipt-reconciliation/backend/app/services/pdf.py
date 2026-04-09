"""
PDF package generation using ReportLab.

Page 1: Summary table
Pages 2+: One matched pair per page (receipt left, invoice right)
"""
import io
from datetime import datetime
from typing import List, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, Image, PageBreak, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from sqlalchemy.orm import Session
from ..models import ExportPackage, ExportPackageItem, Match, Document, User
from . import storage as store

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 1.5 * cm

styles = getSampleStyleSheet()
TITLE_STYLE = ParagraphStyle("title", parent=styles["Title"], fontSize=18, spaceAfter=6)
HEADING_STYLE = ParagraphStyle("heading", parent=styles["Heading2"], fontSize=12)
SMALL_STYLE = ParagraphStyle("small", parent=styles["Normal"], fontSize=8)
LABEL_STYLE = ParagraphStyle("label", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
VALUE_STYLE = ParagraphStyle("value", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold")
RED_STYLE = ParagraphStyle("red", parent=styles["Normal"], fontSize=8, textColor=colors.red)


def _format_amount(amount, currency="RMB") -> str:
    if amount is None:
        return "—"
    return f"¥{float(amount):,.2f}" if currency == "RMB" else f"{float(amount):,.2f} {currency}"


def _format_dt(d, t) -> str:
    parts = []
    if d:
        parts.append(str(d))
    if t:
        parts.append(str(t)[:5])
    return "  ".join(parts) if parts else "—"


def _load_image_flowable(file_url: str, max_w: float, max_h: float) -> Optional[Image]:
    """Download a document image from storage and return a ReportLab Image flowable."""
    try:
        data = store.download_file(file_url)
        img = Image(io.BytesIO(data), width=max_w, height=max_h, kind="bound")
        return img
    except Exception:
        return None


def generate_package_pdf(db: Session, package: ExportPackage, company_name: str = "My Company") -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title=package.package_name,
        author=company_name,
    )

    story = []

    # ── Page 1: Summary ──────────────────────────────────────────────────────
    story.append(Paragraph(company_name, HEADING_STYLE))
    story.append(Paragraph(package.package_name, TITLE_STYLE))
    story.append(Spacer(1, 4 * mm))

    meta_data = [
        ["Generated:", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ["Package ID:", str(package.id)],
        ["Total Pairs:", str(package.total_pairs)],
        ["Total Amount:", _format_amount(package.total_amount)],
    ]
    meta_table = Table(meta_data, colWidths=[4 * cm, 8 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 4 * mm))

    # Summary table header
    headers = ["#", "Vendor", "Receipt Date/Time", "Invoice Date/Time",
               "Receipt Amt", "Invoice Amt", "Invoice No.", "Status"]
    summary_rows = [headers]

    items = (
        db.query(ExportPackageItem)
        .filter(ExportPackageItem.package_id == package.id)
        .order_by(ExportPackageItem.page_number)
        .all()
    )

    pair_data = []
    for idx, item in enumerate(items, 1):
        match: Match = db.query(Match).get(item.match_id)
        if not match:
            continue
        receipt: Document = db.query(Document).get(match.receipt_document_id)
        invoice: Document = db.query(Document).get(match.invoice_document_id)
        if not receipt or not invoice:
            continue

        summary_rows.append([
            str(idx),
            (invoice.vendor_name or receipt.vendor_name or "—")[:30],
            _format_dt(receipt.document_date, receipt.document_time),
            _format_dt(invoice.document_date, invoice.document_time),
            _format_amount(receipt.amount),
            _format_amount(invoice.amount),
            invoice.invoice_number or "—",
            match.status,
        ])
        pair_data.append((idx, match, receipt, invoice))

    col_widths = [1*cm, 5*cm, 4*cm, 4*cm, 3*cm, 3*cm, 4*cm, 3.5*cm]
    sum_table = Table(summary_rows, colWidths=col_widths, repeatRows=1)
    sum_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sum_table)
    story.append(PageBreak())

    # ── Pages 2+: One pair per page ──────────────────────────────────────────
    IMG_W = (PAGE_W - 2 * MARGIN - 2 * cm) / 2
    IMG_H = PAGE_H - 2 * MARGIN - 8 * cm

    for idx, match, receipt, invoice in pair_data:
        story.append(Paragraph(f"Pair {idx} of {len(pair_data)}", SMALL_STYLE))
        story.append(Spacer(1, 2 * mm))

        # Metadata row
        meta = [
            Paragraph(f"<b>Vendor:</b> {invoice.vendor_name or receipt.vendor_name or '—'}", styles["Normal"]),
            Paragraph(f"<b>Receipt Amt:</b> {_format_amount(receipt.amount)}", styles["Normal"]),
            Paragraph(f"<b>Invoice Amt:</b> {_format_amount(invoice.amount)}", styles["Normal"]),
            Paragraph(f"<b>Invoice No:</b> {invoice.invoice_number or '—'}", styles["Normal"]),
            Paragraph(f"<b>Status:</b> {match.status}", styles["Normal"]),
        ]
        meta_row = [[m] for m in meta]
        meta_t = Table([meta], colWidths=[5.5*cm]*5)
        meta_t.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(meta_t)
        story.append(Spacer(1, 2 * mm))

        # Warnings
        for w in match.warnings:
            color = colors.red if w.severity == "critical" else colors.orange if w.severity == "warning" else colors.grey
            story.append(Paragraph(f"⚠ {w.warning_message}", ParagraphStyle("warn", parent=SMALL_STYLE, textColor=color)))

        story.append(Spacer(1, 3 * mm))

        # Document images side by side
        r_img = _load_image_flowable(receipt.file_url, IMG_W, IMG_H)
        i_img = _load_image_flowable(invoice.file_url, IMG_W, IMG_H)

        r_cell = r_img or Paragraph("Receipt image unavailable", SMALL_STYLE)
        i_cell = i_img or Paragraph("Invoice image unavailable", SMALL_STYLE)

        img_table = Table(
            [[
                [Paragraph("<b>Receipt / 小票</b>", HEADING_STYLE), r_cell],
                [Paragraph("<b>Invoice / 发票</b>", HEADING_STYLE), i_cell],
            ]],
            colWidths=[IMG_W + 1 * cm, IMG_W + 1 * cm],
        )
        img_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.grey),
        ]))
        story.append(img_table)

        if idx < len(pair_data):
            story.append(PageBreak())

    doc.build(story)
    return buf.getvalue()
