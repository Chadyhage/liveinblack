from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "features-par-role-web-mobile-exhaustif.md"
OUTPUT = ROOT / "output" / "pdf" / "features-par-role-web-mobile-exhaustif-live-in-black.pdf"


PALETTE = {
    "ink": colors.HexColor("#141414"),
    "muted": colors.HexColor("#5E6470"),
    "line": colors.HexColor("#D9D1C7"),
    "gold": colors.HexColor("#C8A24A"),
    "deep": colors.HexColor("#1F2A2E"),
    "soft": colors.HexColor("#F6F2EA"),
    "rose": colors.HexColor("#A84E5B"),
}


def xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline_markup(text: str) -> str:
    text = xml_escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = text.replace("Lien:", "<b>Lien:</b>")
    text = text.replace("Objectif du document:", "<b>Objectif du document:</b>")
    return text


def split_feature(line: str) -> tuple[str, str] | None:
    match = re.match(r"\*\*(.+?)\.\*\*\s*(.+)", line)
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    page = canvas.getPageNumber()

    canvas.setFillColor(PALETTE["deep"])
    canvas.rect(0, height - 1.05 * cm, width, 1.05 * cm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(1.4 * cm, height - 0.65 * cm, "LIVE IN BLACK")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 1.4 * cm, height - 0.65 * cm, "Catalogue exhaustif des fonctionnalites")

    canvas.setStrokeColor(PALETTE["line"])
    canvas.line(1.4 * cm, 1.05 * cm, width - 1.4 * cm, 1.05 * cm)
    canvas.setFillColor(PALETTE["muted"])
    canvas.setFont("Helvetica", 8)
    canvas.drawString(1.4 * cm, 0.65 * cm, "Document non technique - Web et Mobile")
    canvas.drawRightString(width - 1.4 * cm, 0.65 * cm, f"Page {page}")
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=27,
            leading=32,
            textColor=PALETTE["ink"],
            alignment=TA_CENTER,
            spaceAfter=14,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=18,
            textColor=PALETTE["muted"],
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=PALETTE["deep"],
            spaceBefore=14,
            spaceAfter=9,
            keepWithNext=True,
        ),
        "feature_title": ParagraphStyle(
            "feature_title",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=PALETTE["rose"],
            spaceBefore=5,
            spaceAfter=2,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.1,
            leading=12.8,
            textColor=PALETTE["ink"],
            alignment=TA_LEFT,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=PALETTE["muted"],
            spaceAfter=5,
        ),
    }


def build_story() -> list:
    styles = build_styles()
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = []

    title = lines[0].lstrip("# ").strip()
    story.append(Spacer(1, 3.1 * cm))
    story.append(Paragraph(xml_escape(title), styles["cover_title"]))
    story.append(Paragraph("Rapport client non technique", styles["cover_subtitle"]))
    story.append(
        Paragraph(
            "Chaque fonctionnalite est expliquee avec son chemin d'acces, son role concret et sa valeur pour LIVE IN BLACK.",
            styles["cover_subtitle"],
        )
    )
    story.append(Spacer(1, 0.8 * cm))
    story.append(
        Paragraph(
            "Web, mobile, espaces organisateur, prestataire, agent, billetterie, messagerie, paiements, moderation et automatisations.",
            styles["cover_subtitle"],
        )
    )
    story.append(PageBreak())

    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        if line.startswith("## "):
            story.append(Paragraph(xml_escape(line[3:]), styles["h1"]))
            continue
        feature = split_feature(line)
        if feature:
            feature_title, body = feature
            story.append(
                KeepTogether(
                    [
                        Paragraph(xml_escape(feature_title), styles["feature_title"]),
                        Paragraph(inline_markup(body), styles["body"]),
                    ]
                )
            )
            continue
        if line.startswith("Periode de lecture"):
            story.append(Paragraph(inline_markup(line), styles["small"]))
            continue
        story.append(Paragraph(inline_markup(line), styles["body"]))

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=1.45 * cm,
        leftMargin=1.45 * cm,
        topMargin=1.55 * cm,
        bottomMargin=1.35 * cm,
        title="LIVE IN BLACK - Catalogue exhaustif des fonctionnalites",
        author="Codex",
    )
    doc.build(build_story(), onFirstPage=draw_page, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
