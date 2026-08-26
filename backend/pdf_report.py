"""Daily QC report PDF builder (brutalist: black rules, mono type, no rounded corners)."""
import io
from datetime import datetime
from typing import Any, Dict, List, Optional

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

BLACK = colors.HexColor("#111111")
GREY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#F1F1F1")
GREEN = colors.HexColor("#1B7F3B")
RED = colors.HexColor("#C42B1C")
AMBER = colors.HexColor("#B26A00")

PAGE_W, PAGE_H = A4
MARGIN = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

S_TITLE = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=colors.white)
S_SUB = ParagraphStyle("s", fontName="Courier", fontSize=8.5, leading=11, textColor=colors.white)
S_H2 = ParagraphStyle("h2", fontName="Courier-Bold", fontSize=9, leading=12,
                      textColor=colors.white, spaceAfter=0)
S_H3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=BLACK)
S_BODY = ParagraphStyle("b", fontName="Helvetica", fontSize=8, leading=10, textColor=BLACK)
S_MONO = ParagraphStyle("m", fontName="Courier", fontSize=7.5, leading=9.5, textColor=BLACK)
S_MUTED = ParagraphStyle("mu", fontName="Courier", fontSize=7, leading=9, textColor=GREY)
S_CAP = ParagraphStyle("cap", fontName="Courier", fontSize=6.5, leading=8, textColor=GREY,
                       alignment=TA_CENTER)


def _res_color(result: Optional[str]):
    if result == "PASS":
        return GREEN
    if result == "FAIL":
        return RED
    return AMBER


def _p(text: Any, style=S_BODY) -> Paragraph:
    if text is None or text == "":
        text = "—"
    text = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(text, style)


def _section_bar(label: str) -> Table:
    t = Table([[Paragraph(label.upper(), S_H2)]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _grid(data, col_widths, header=True, align_center_cols=()):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.6, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), LIGHT)]
    for c in align_center_cols:
        style.append(("ALIGN", (c, 0), (c, -1), "CENTER"))
    t.setStyle(TableStyle(style))
    return t


def _stat_row(pairs: List[tuple]) -> Table:
    cells, styles = [], []
    row_labels = [_p(lbl, S_MUTED) for lbl, _, _ in pairs]
    row_values = []
    for i, (_, val, col) in enumerate(pairs):
        row_values.append(Paragraph(f"<b>{val}</b>", ParagraphStyle(
            f"v{i}", fontName="Courier-Bold", fontSize=15, leading=17, textColor=col or BLACK)))
    cells = [row_values, row_labels]
    w = CONTENT_W / len(pairs)
    t = Table(cells, colWidths=[w] * len(pairs))
    styles = [
        ("BOX", (0, 0), (-1, -1), 0.8, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BLACK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
    ]
    t.setStyle(TableStyle(styles))
    return t


def _thumb(raw: bytes, box_w: float, box_h: float) -> Optional[Image]:
    try:
        img = PILImage.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((900, 900))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=72)
        buf.seek(0)
        iw, ih = ImageReader(buf).getSize()
        buf.seek(0)
        scale = min(box_w / iw, box_h / ih)
        return Image(buf, width=iw * scale, height=ih * scale)
    except Exception:
        return None


def _spec(item: Dict[str, Any]) -> str:
    lo, hi, unit = item.get("critical_limit_min"), item.get("critical_limit_max"), item.get("unit") or ""
    if lo is None and hi is None:
        lo, hi = item.get("minimum_value"), item.get("maximum_value")
    if lo is not None and hi is not None:
        return f"{lo} – {hi} {unit}".strip()
    if lo is not None:
        return f"min {lo} {unit}".strip()
    if hi is not None:
        return f"max {hi} {unit}".strip()
    return "As per standard"


def _observed(r: Dict[str, Any]) -> str:
    if r.get("numeric_value") is not None:
        return f"{r['numeric_value']} {r.get('unit') or ''}".strip()
    if r.get("actual_value") is not None:
        return f"{r['actual_value']} {r.get('unit') or ''}".strip()
    return r.get("value") or "—"


def _sign_off(prepared_by: str) -> Table:
    head = ["PREPARED BY (QC EXECUTIVE)", "VERIFIED BY (QC MANAGER)", "APPROVED BY (PLANT HEAD)"]
    names = [_p(prepared_by, S_MONO), _p("", S_MONO), _p("", S_MONO)]
    data = [
        [_p(h, S_MUTED) for h in head],
        names,
        [_p("Signature / Date", S_MUTED)] * 3,
        [Spacer(1, 22 * mm if False else 16 * mm)] * 3,
    ]
    w = CONTENT_W / 3
    t = Table(data, colWidths=[w] * 3)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _header_block(report: Dict[str, Any]) -> Table:
    left = [
        Paragraph("DAILY QC REPORT", S_TITLE),
        Paragraph(f"{report['header']['company']} · {report['header']['department']}", S_SUB),
    ]
    right = [
        Paragraph(f"DATE: {report['header']['date']}", S_SUB),
        Paragraph(f"GENERATED: {report.get('generated_at', '')[:19].replace('T', ' ')} UTC", S_SUB),
        Paragraph(f"SCOPE: {report.get('scope', 'ALL INSPECTIONS')}", S_SUB),
    ]
    t = Table([[left, right]], colWidths=[CONTENT_W * 0.58, CONTENT_W * 0.42])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _inspection_block(d: Dict[str, Any], photos: Dict[str, bytes]) -> List[Any]:
    flow: List[Any] = []
    result = d.get("overall_result") or "PENDING"
    meta = Table([[
        Paragraph(f"<b>{d.get('product_name', '')}</b>", S_H3),
        _p(f"BATCH: {d.get('batch_number', '')}", S_MONO),
        _p(f"SHIFT: {d.get('shift') or '—'}", S_MONO),
        Paragraph(f"<b>{result}</b>", ParagraphStyle("r", fontName="Courier-Bold", fontSize=9,
                                                     textColor=_res_color(result))),
    ]], colWidths=[CONTENT_W * 0.4, CONTENT_W * 0.24, CONTENT_W * 0.2, CONTENT_W * 0.16])
    meta.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, BLACK),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 0), (3, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(meta)
    flow.append(Spacer(1, 2 * mm))
    line2 = (f"Line: {d.get('production_line') or '—'}   |   QC: {d.get('qc_user_name') or '—'}   |   "
             f"Start: {(d.get('start_time') or '')[11:16] or '—'}   |   "
             f"End: {(d.get('end_time') or '')[11:16] or '—'}   |   Status: {d.get('status', '')}")
    flow.append(_p(line2, S_MUTED))
    flow.append(Spacer(1, 3 * mm))

    readings = d.get("ccp_readings", [])
    if readings:
        head = [_p(h, S_MUTED) for h in
                ["CCP", "CRITICAL CONTROL POINT", "TIME", "READING", "CRITICAL LIMIT", "RESULT", "CORRECTIVE ACTION"]]
        rows = [head]
        for r in readings:
            ca = r.get("corrective_action") or {}
            action = ca.get("corrective_action") or r.get("remarks") or "—"
            rows.append([
                _p(r.get("ccp_number"), S_MONO),
                _p(r.get("ccp_name"), S_BODY),
                _p(r.get("reading_time") or "—", S_MONO),
                _p(_observed(r), S_MONO),
                _p(_spec(r), S_MONO),
                Paragraph(f"<b>{r.get('result') or '—'}</b>", ParagraphStyle(
                    "cr", fontName="Courier-Bold", fontSize=7.5, textColor=_res_color(r.get("result")))),
                _p(action, S_MONO),
            ])
        w = CONTENT_W
        flow.append(_grid(rows, [w * 0.07, w * 0.22, w * 0.08, w * 0.11, w * 0.15, w * 0.09, w * 0.28],
                          align_center_cols=(0, 5)))
        flow.append(Spacer(1, 3 * mm))

    results = d.get("results", [])
    if results:
        sections: Dict[str, List[Dict[str, Any]]] = {}
        for r in results:
            sections.setdefault(r.get("section") or "General", []).append(r)
        for sec, items in sections.items():
            rows = [[_p(h, S_MUTED) for h in ["#", f"{sec.upper()} — PARAMETER", "SPECIFICATION",
                                              "OBSERVED", "RESULT", "REMARKS"]]]
            for i, r in enumerate(items, 1):
                rows.append([
                    _p(i, S_MONO),
                    _p(r.get("parameter_name"), S_BODY),
                    _p(_spec(r), S_MONO),
                    _p(_observed(r), S_MONO),
                    Paragraph(f"<b>{r.get('result') or '—'}</b>", ParagraphStyle(
                        "pr", fontName="Courier-Bold", fontSize=7.5, textColor=_res_color(r.get("result")))),
                    _p(r.get("remarks"), S_MONO),
                ])
            w = CONTENT_W
            flow.append(_grid(rows, [w * 0.05, w * 0.28, w * 0.16, w * 0.14, w * 0.09, w * 0.28],
                              align_center_cols=(0, 4)))
            flow.append(Spacer(1, 3 * mm))

    if d.get("remarks"):
        flow.append(_p(f"Inspector remarks: {d['remarks']}", S_MONO))
        flow.append(Spacer(1, 2 * mm))

    # photo evidence for this inspection
    shots = []
    for r in d.get("results", []):
        if r.get("photo_path") and r["photo_path"] in photos:
            shots.append((r["photo_path"], f"{r.get('parameter_name')} · {r.get('result') or ''}"))
    for r in d.get("ccp_readings", []):
        if r.get("photo_path") and r["photo_path"] in photos:
            shots.append((r["photo_path"], f"CCP {r.get('ccp_number')} {r.get('ccp_name')} · {r.get('result') or ''}"))
    if shots:
        flow.append(_p("PHOTO EVIDENCE", S_MUTED))
        flow.append(Spacer(1, 1.5 * mm))
        cols = 3
        cell_w = CONTENT_W / cols
        for start in range(0, len(shots), cols):
            chunk = shots[start:start + cols]
            img_row, cap_row = [], []
            for path, caption in chunk:
                img = _thumb(photos[path], cell_w - 8, 42 * mm)
                img_row.append(img or _p("Image unavailable", S_MUTED))
                cap_row.append(_p(caption, S_CAP))
            t = Table([img_row, cap_row], colWidths=[cell_w] * len(chunk))
            t.setStyle(TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.6, BLACK),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, BLACK),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            flow.append(t)
            flow.append(Spacer(1, 2 * mm))
    flow.append(Spacer(1, 4 * mm))
    return flow


def build_daily_pdf(report: Dict[str, Any], inspections: List[Dict[str, Any]],
                    photos: Dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=18 * mm,
                          title=f"Daily QC Report {report['header']['date']}",
                          author="QC Inspect")
    frame = Frame(MARGIN, 18 * mm, CONTENT_W, PAGE_H - MARGIN - 18 * mm, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    date_str = report["header"]["date"]

    def footer(canv, _doc):
        canv.saveState()
        canv.setStrokeColor(BLACK)
        canv.setLineWidth(0.8)
        canv.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canv.setFont("Courier", 7)
        canv.setFillColor(GREY)
        canv.drawString(MARGIN, 10 * mm, f"QC INSPECT · DAILY QC REPORT · {date_str}")
        canv.drawRightString(PAGE_W - MARGIN, 10 * mm, f"PAGE {canv.getPageNumber()}")
        canv.drawCentredString(PAGE_W / 2, 10 * mm, "CONTROLLED DOCUMENT — QA RECORD")
        canv.restoreState()

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=footer)])

    flow: List[Any] = [_header_block(report), Spacer(1, 4 * mm)]

    p = report["production_summary"]
    q = report["qc_summary"]
    c = report["ccp_summary"]
    flow += [_section_bar("Production summary"), Spacer(1, 2 * mm),
             _stat_row([("PRODUCTS", p["products_inspected"], None),
                        ("BATCHES", p["batches_inspected"], None),
                        ("INSPECTIONS", p["total_inspections"], None)]),
             Spacer(1, 4 * mm),
             _section_bar("QC result summary"), Spacer(1, 2 * mm),
             _stat_row([("PASSED", q["passed"], GREEN), ("FAILED", q["failed"], RED),
                        ("PENDING", q["pending"], AMBER)]),
             Spacer(1, 4 * mm),
             _section_bar("CCP monitoring summary"), Spacer(1, 2 * mm),
             _stat_row([("MONITORED", c["monitored"], None), ("PASSED", c["passed"], GREEN),
                        ("FAILED", c["failed"], RED)]),
             Spacer(1, 5 * mm)]

    ps = report.get("product_summary", [])
    flow += [_section_bar(f"Batch overview ({len(ps)})"), Spacer(1, 2 * mm)]
    if ps:
        rows = [[_p(h, S_MUTED) for h in ["#", "PRODUCT", "BATCH", "SHIFT", "RESULT", "KEY FINDINGS"]]]
        for i, row in enumerate(ps, 1):
            rows.append([
                _p(i, S_MONO), _p(row["product"], S_BODY), _p(row["batch"], S_MONO),
                _p(row.get("shift"), S_MONO),
                Paragraph(f"<b>{row['result']}</b>", ParagraphStyle(
                    "br", fontName="Courier-Bold", fontSize=7.5, textColor=_res_color(row["result"]))),
                _p("; ".join(row.get("findings") or []) or "None", S_MONO),
            ])
        w = CONTENT_W
        flow.append(_grid(rows, [w * 0.05, w * 0.25, w * 0.16, w * 0.1, w * 0.1, w * 0.34],
                          align_center_cols=(0, 4)))
    else:
        flow.append(_p("No inspections recorded for this date.", S_MONO))
    flow.append(Spacer(1, 5 * mm))

    ncs = report.get("nonconformance_summary", [])
    if ncs:
        flow += [_section_bar(f"Non-conformances & corrective actions ({len(ncs)})"), Spacer(1, 2 * mm)]
        rows = [[_p(h, S_MUTED) for h in ["#", "PRODUCT", "BATCH", "ISSUE", "CORRECTIVE ACTION", "STATUS"]]]
        for i, n in enumerate(ncs, 1):
            rows.append([
                _p(i, S_MONO), _p(n["product"], S_BODY), _p(n["batch"], S_MONO),
                _p(n["issue"], S_BODY), _p(n.get("corrective_action") or "Pending", S_MONO),
                _p(n.get("status"), S_MONO),
            ])
        w = CONTENT_W
        flow.append(_grid(rows, [w * 0.05, w * 0.18, w * 0.14, w * 0.22, w * 0.28, w * 0.13],
                          align_center_cols=(0,)))
        flow.append(Spacer(1, 5 * mm))

    if inspections:
        flow.append(_section_bar("Inspection records — CCPs & parameter checks"))
        flow.append(Spacer(1, 3 * mm))
        for idx, d in enumerate(inspections, 1):
            block = _inspection_block(d, photos)
            flow.append(KeepTogether(block[:3]))
            flow += block[3:]

    flow.append(Spacer(1, 3 * mm))
    flow.append(KeepTogether([_section_bar("Sign-off"), Spacer(1, 2 * mm),
                              _sign_off(report.get("prepared_by") or "—"), Spacer(1, 2 * mm),
                              _p("This report is a controlled quality record. Signatures confirm that all CCPs "
                                 "and finished-product parameters listed above were monitored and verified as per "
                                 "the approved HACCP plan.", S_MUTED)]))

    doc.build(flow)
    return buf.getvalue()


def default_filename(date: str) -> str:
    stamp = datetime.utcnow().strftime("%H%M%S")
    return f"QC-Daily-Report-{date}-{stamp}.pdf"
