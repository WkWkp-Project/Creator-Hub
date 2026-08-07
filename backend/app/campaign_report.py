"""Render a campaign handoff report as a self-contained PNG or PDF."""
from __future__ import annotations

import io
import os
import re
from datetime import datetime
from functools import lru_cache
from typing import Any

from PIL import Image, ImageDraw, ImageFont


PAGE_SIZE = (1240, 1754)
ROWS_PER_PAGE = 22
MAX_VISUAL_ROWS = 200
FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
FONT_FILE = os.path.join(FONT_DIR, "NotoSansThai-Variable.ttf")

INK = "#171719"
MUTED = "#6F7078"
LINE = "#DDDAD2"
PAPER = "#FCFBF8"
RED = "#E30C1A"
GOLD = "#B8892D"
SOFT = "#F2EFE8"


@lru_cache(maxsize=32)
def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(FONT_FILE, size)
    font.set_variation_by_axes([700 if bold else 400, 100])
    return font


def _text(value: Any) -> str:
    value = "" if value is None else str(value)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()


def _fit(draw: ImageDraw.ImageDraw, value: Any, font: ImageFont.FreeTypeFont, width: int) -> str:
    text = _text(value).replace("\n", " ")
    if draw.textlength(text, font=font) <= width:
        return text
    suffix = "..."
    while text and draw.textlength(text + suffix, font=font) > width:
        text = text[:-1]
    return text + suffix


def _money(value: Any) -> str:
    try:
        return f"{float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return "0"


def _page(campaign: dict[str, Any], rows: list[dict[str, Any]], page: int, total: int) -> Image.Image:
    image = Image.new("RGB", PAGE_SIZE, PAPER)
    draw = ImageDraw.Draw(image)
    title_font, label_font = _font(50, True), _font(21, True)
    body_font, small_font = _font(21), _font(18)

    draw.rectangle((0, 0, PAGE_SIZE[0], 18), fill=RED)
    draw.text((72, 62), "INFLUENCER", font=_font(25, True), fill=RED)
    draw.text((72, 128), _fit(draw, campaign.get("campaign_name") or "Campaign", title_font, 1080), font=title_font, fill=INK)
    client = campaign.get("client_name") or "No company"
    period = " - ".join(filter(None, [campaign.get("period_start"), campaign.get("period_end")])) or "No period"
    draw.text((72, 202), f"{client}  |  {period}", font=body_font, fill=MUTED)
    draw.rounded_rectangle((1000, 62, 1168, 110), radius=8, fill=SOFT)
    draw.text((1020, 72), _fit(draw, campaign.get("status") or "Draft", label_font, 128), font=label_font, fill=INK)

    cards = [
        ("KOL", str(len(campaign.get("kols") or []))),
        ("Budget", _money(campaign.get("_report_budget", 0))),
        ("Linked files", str(sum(1 for f in (campaign.get("input_files") or []) if f.get("linked") or f.get("drive_url")))),
    ]
    for index, (label, value) in enumerate(cards):
        x = 72 + index * 365
        draw.rounded_rectangle((x, 264, x + 335, 382), radius=10, fill="white", outline=LINE, width=2)
        draw.text((x + 22, 286), label, font=small_font, fill=MUTED)
        draw.text((x + 22, 322), _fit(draw, value, _font(29, True), 290), font=_font(29, True), fill=INK)

    draw.text((72, 438), "KOL PLAN", font=_font(24, True), fill=GOLD)
    columns = [
        ("KOL", 72, 300), ("Type", 390, 130), ("SOW", 540, 230),
        ("Approved", 790, 135), ("Post date", 945, 130), ("Total", 1085, 83),
    ]
    draw.rectangle((72, 486, 1168, 534), fill=INK)
    for label, x, width in columns:
        draw.text((x + 8, 496), _fit(draw, label, small_font, width - 16), font=small_font, fill="white")

    y = 534
    for index, row in enumerate(rows):
        if index % 2:
            draw.rectangle((72, y, 1168, y + 48), fill="#F5F3EE")
        values = [row.get("KOL"), row.get("Type"), row.get("SOW"), row.get("Approved"), row.get("Post Date"), _money(row.get("Total"))]
        for value, (_, x, width) in zip(values, columns):
            draw.text((x + 8, y + 11), _fit(draw, value, small_font, width - 16), font=small_font, fill=INK)
        draw.line((72, y + 48, 1168, y + 48), fill=LINE, width=1)
        y += 48

    if not rows:
        draw.text((88, 558), "No KOL entries", font=body_font, fill=MUTED)

    description = _fit(draw, campaign.get("description") or "", body_font, 1096)
    if description:
        draw.text((72, 1640), description, font=body_font, fill=MUTED)
    draw.text((72, 1690), f"Exported {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  Creator Hub", font=small_font, fill=MUTED)
    draw.text((1084, 1690), f"{page}/{total}", font=small_font, fill=MUTED)
    return image


def render_campaign_report(campaign: dict[str, Any], rows: list[dict[str, Any]], output_format: str) -> io.BytesIO:
    if len(rows) > MAX_VISUAL_ROWS:
        raise ValueError(f"Visual exports support up to {MAX_VISUAL_ROWS} KOL entries; use XLSX or CSV for larger campaigns.")

    chunks = [rows[i:i + ROWS_PER_PAGE] for i in range(0, len(rows), ROWS_PER_PAGE)] or [[]]
    report_campaign = {
        **campaign,
        "_report_budget": sum(float(row.get("Total") or 0) for row in rows),
    }
    output = io.BytesIO()
    if output_format == "pdf":
        pages = [_page(report_campaign, chunk, i + 1, len(chunks)) for i, chunk in enumerate(chunks)]
        pages[0].save(output, "PDF", resolution=150, save_all=True, append_images=pages[1:])
        for page in pages:
            page.close()
    else:
        gap = 20
        height = PAGE_SIZE[1] * len(chunks) + gap * (len(chunks) - 1)
        combined = Image.new("RGB", (PAGE_SIZE[0], height), "#D8D5CE")
        y = 0
        for index, chunk in enumerate(chunks):
            page = _page(report_campaign, chunk, index + 1, len(chunks))
            combined.paste(page, (0, y))
            y += page.height + gap
            page.close()
        combined.save(output, "PNG", optimize=True)
        combined.close()
    output.seek(0)
    return output
