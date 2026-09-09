"""
PDF report generation: aggregates review data for a restaurant over a
chosen period (daily/weekly/monthly) into a professional 8-section
corporate analytics PDF, then renders it via Playwright headless Chromium.

Sections:
  1. Cover / Header
  2. KPI Summary
  3. Sentiment Interpretation
  4. Complaint Category Analysis
  5. Root-Cause Analysis
  6. AI-Generated Action Plan
  7. Future Outlook
  8. Footer

All numerical values come from the database — Gemini generates only
natural-language interpretation and is explicitly instructed NOT to invent
or modify statistics.  Falls back to deterministic rule-based text if
Gemini is unavailable.
"""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from prisma import Prisma
from playwright.async_api import async_playwright

from app.config import get_settings

logger = logging.getLogger(__name__)

PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}
PERIOD_LABELS = {
    "daily": "Daily Report — Last 24 Hours",
    "weekly": "Weekly Report — Last 7 Days",
    "monthly": "Monthly Report — Last 30 Days",
}

ALL_CATEGORIES = [
    "Food Quality",
    "Service Delay",
    "Staff Behavior",
    "Pricing",
    "Cleanliness",
    "Ambience",
    "Other",
]

CATEGORY_COLORS = {
    "Food Quality":    "#c2410c",
    "Service Delay":   "#b91c1c",
    "Staff Behavior":  "#7c3aed",
    "Pricing":         "#a16207",
    "Cleanliness":     "#0e7490",
    "Ambience":        "#065f46",
    "Other":           "#475569",
}


# ── Utilities ─────────────────────────────────────────────────────────────────

def _naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize to naive UTC (handles both aware and naive Prisma datetimes)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _esc(text: Optional[str]) -> str:
    """Minimal HTML-escape for text injected into the template."""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )


def _stars(n: Optional[float]) -> str:
    n = int(n or 0)
    return "★" * n + "☆" * (5 - n)


# ── Data Aggregation ──────────────────────────────────────────────────────────

async def _aggregate_report_data(restaurant_id: str, period: str, db: Prisma) -> dict:
    if period not in PERIOD_DAYS:
        raise ValueError(f"Invalid period '{period}'. Must be one of: {list(PERIOD_DAYS)}")

    days = PERIOD_DAYS[period]
    cutoff = datetime.utcnow() - timedelta(days=days)
    now = datetime.utcnow()

    restaurant = await db.restaurant.find_first(where={"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found")

    all_reviews = await db.review.find_many(where={"restaurant_id": restaurant_id})
    reviews = [
        r for r in all_reviews
        if _naive_utc(r.scraped_at) and _naive_utc(r.scraped_at) >= cutoff
    ]

    # ── Basic KPIs ────────────────────────────────────────────────────────────
    ratings = [r.rating for r in reviews if r.rating is not None]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    platform_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}

    for r in reviews:
        if r.sentiment:
            sentiment_counts[r.sentiment] = sentiment_counts.get(r.sentiment, 0) + 1
        if r.source:
            platform_counts[r.source] = platform_counts.get(r.source, 0) + 1
        for cat in (r.complaint_categories or []):
            category_counts[cat] = category_counts.get(cat, 0) + 1

    sent_total = sum(sentiment_counts.values()) or 1

    pos_pct = round(sentiment_counts["positive"] / sent_total * 100)
    neu_pct = round(sentiment_counts["neutral"] / sent_total * 100)
    neg_pct = round(sentiment_counts["negative"] / sent_total * 100)

    # Ensure percentages sum to 100 (adjust neutral for rounding)
    rounding_diff = 100 - (pos_pct + neu_pct + neg_pct)
    neu_pct += rounding_diff

    sentiment_pct = {"positive": pos_pct, "neutral": neu_pct, "negative": neg_pct}

    # Sort categories by count descending
    sorted_cats = dict(sorted(category_counts.items(), key=lambda x: -x[1]))
    top_category = list(sorted_cats.keys())[0] if sorted_cats else "None"

    # Platform coverage string
    platform_names = [p.capitalize() for p in platform_counts.keys()]
    platform_coverage = ", ".join(platform_names) if platform_names else "None"

    # Sample reviews for AI context
    top_negative = sorted(
        [r for r in reviews if r.sentiment == "negative"],
        key=lambda r: _naive_utc(r.scraped_at) or datetime.min,
        reverse=True,
    )[:5]
    top_positive = sorted(
        [r for r in reviews if r.sentiment == "positive"],
        key=lambda r: _naive_utc(r.scraped_at) or datetime.min,
        reverse=True,
    )[:5]

    return {
        "restaurant":         restaurant,
        "period":             period,
        "period_label":       PERIOD_LABELS[period],
        "range_start":        cutoff,
        "range_end":          now,
        "total_reviews":      len(reviews),
        "avg_rating":         avg_rating,
        "sentiment_counts":   sentiment_counts,
        "sentiment_pct":      sentiment_pct,
        "platform_counts":    platform_counts,
        "platform_coverage":  platform_coverage,
        "category_counts":    sorted_cats,
        "top_category":       top_category,
        "neg_pct":            neg_pct,
        "pos_pct":            pos_pct,
        "neu_pct":            neu_pct,
        "top_negative":       top_negative,
        "top_positive":       top_positive,
    }


# ── Fallback AI Content ───────────────────────────────────────────────────────

def _fallback_ai_analysis(data: dict) -> dict:
    """
    Rule-based text for all four AI sections.
    Used when Gemini is unavailable so the PDF always generates completely.
    Returns a dict with keys: sentiment_interpretation, root_cause,
    action_plan, future_outlook.
    """
    cats = list(data["category_counts"].items())
    top_cats = [c for c, _ in cats[:3]]
    top_cats_str = ", ".join(top_cats) if top_cats else "no significant categories"
    neg_pct = data["neg_pct"]
    pos_pct = data["pos_pct"]
    total = data["total_reviews"]
    avg = data["avg_rating"]

    # Sentiment interpretation
    if pos_pct >= 60:
        sent_tone = "predominantly positive"
    elif neg_pct >= 40:
        sent_tone = "notably negative, requiring immediate attention"
    else:
        sent_tone = "mixed"

    sentiment_interp = (
        f"Customer sentiment during the selected period was {sent_tone}. "
        f"Of the {total} reviews analyzed, {pos_pct}% expressed positive experiences, "
        f"{data['neu_pct']}% were neutral, and {neg_pct}% were negative. "
    )
    if avg:
        sentiment_interp += (
            f"The average rating of {avg}★ "
            + ("reflects a generally satisfactory guest experience." if avg >= 3.5 else
               "indicates significant areas requiring operational improvement.")
        )

    # Root-cause
    rc_lines = []
    for cat, count in cats[:4]:
        pct = round(count / max(total, 1) * 100)
        rc_lines.append(
            f"## {cat}\n"
            f"- **Pattern:** {count} complaint mentions ({pct}% of total reviews)\n"
            f"- **Likely Cause:** Recurring guest dissatisfaction with {cat.lower()} standards\n"
            f"- **Business Impact:** May contribute to lower ratings and reduced repeat visits\n"
        )
    if not rc_lines:
        rc_lines.append("## No Significant Complaint Categories\n- No major recurring complaint patterns were detected in this period.\n")
    root_cause = "\n".join(rc_lines)

    # Action plan
    ap_lines = ["## Priority 1 — Immediate Action"]
    if cats:
        cat1, count1 = cats[0]
        ap_lines.append(
            f"- **Issue:** {cat1} complaints ({count1} mentions)\n"
            f"- **Action:** Conduct an immediate operational review of {cat1.lower()} standards and brief frontline staff\n"
            f"- **Expected Benefit:** Reduce {cat1.lower()} complaints by addressing root causes directly\n"
        )
    else:
        ap_lines.append("- Maintain current standards — no critical complaint categories detected.\n")

    ap_lines.append("## Priority 2 — Short-Term Action")
    if len(cats) > 1:
        cat2, count2 = cats[1]
        ap_lines.append(
            f"- **Issue:** {cat2} complaints ({count2} mentions)\n"
            f"- **Action:** Review {cat2.lower()} procedures and implement process improvements within the next 2 weeks\n"
            f"- **Expected Benefit:** Improved guest scores in {cat2.lower()}\n"
        )
    else:
        ap_lines.append("- Continue monitoring review trends across all platforms.\n")

    ap_lines.append("## Priority 3 — Continuous Improvement")
    ap_lines.append(
        f"- **Issue:** Overall negative sentiment at {neg_pct}%\n"
        "- **Action:** Establish a weekly review audit and response protocol for all negative reviews\n"
        "- **Expected Benefit:** Proactive reputation management and improved guest trust\n"
    )
    action_plan = "\n".join(ap_lines)

    # Future outlook
    future_lines = [
        "## Areas Requiring Continued Monitoring",
        f"- {top_cats_str} remain the most frequently cited concerns and should be tracked weekly.",
        "## Expected Focus Areas",
        f"- If the current negative review rate ({neg_pct}%) is not addressed, it may stabilize or increase.",
        "## Reputation Risks",
        "- Unresolved recurring complaints may lead to lower platform ratings over time.",
        "## Opportunities for Improvement",
        "- Proactive engagement with negative reviewers can convert detractors into loyal guests.",
        "## Recommended Monitoring",
        "- Review all platforms (Google, Zomato, TripAdvisor) weekly for emerging complaint patterns.",
    ]
    future_outlook = "\n".join(future_lines)

    return {
        "sentiment_interpretation": sentiment_interp,
        "root_cause":               root_cause,
        "action_plan":              action_plan,
        "future_outlook":           future_outlook,
        "is_fallback":              True,
    }


# ── Gemini AI Analysis ────────────────────────────────────────────────────────

async def _generate_ai_analysis(data: dict) -> dict:
    """
    Call Gemini to generate all four natural-language sections.
    Falls back to rule-based content on any failure.
    """
    settings = get_settings()

    # Build the structured data block passed to Gemini
    category_text = "\n".join(
        f"  - {cat}: {count} mentions"
        for cat, count in data["category_counts"].items()
    ) or "  - No complaint categories recorded this period"

    negative_excerpts = "\n".join(
        f"  - ({_esc(r.source)}, {r.rating}★): {(r.review_text or '')[:200]}"
        for r in data["top_negative"]
    ) or "  - No negative reviews in this period"

    r = data["restaurant"]
    period_label = data["period_label"]

    prompt = f"""You are a restaurant operations analyst preparing a professional management report for {_esc(r.name)} ({_esc(r.branch_code)}) — {_esc(r.city)}.

=== VERIFIED DATA BLOCK (DO NOT MODIFY OR CONTRADICT THESE NUMBERS) ===
Report Period: {period_label}
Date Range: {data['range_start'].strftime('%d %b %Y')} to {data['range_end'].strftime('%d %b %Y')}
Total Reviews Analyzed: {data['total_reviews']}
Average Rating: {data['avg_rating'] or 'N/A'} / 5.0
Positive Reviews: {data['sentiment_counts']['positive']} ({data['pos_pct']}%)
Neutral Reviews: {data['sentiment_counts']['neutral']} ({data['neu_pct']}%)
Negative Reviews: {data['sentiment_counts']['negative']} ({data['neg_pct']}%)
Most Frequent Complaint Category: {data['top_category']}
Platform Coverage: {data['platform_coverage']}
Complaint Category Mentions (a single review may contribute to multiple categories):
{category_text}
Sample Negative Reviews:
{negative_excerpts}
=== END DATA BLOCK ===

CRITICAL RULES:
- Do NOT invent, modify, or contradict any numbers in the data block above.
- Do NOT add complaint counts, review counts, ratings, or percentages that are not in the data block.
- If data is insufficient to make a confident statement, say so explicitly.
- Use hedged language ("the data suggests", "a recurring pattern indicates", "this may point to") when certainty is not possible.
- Be specific to this outlet and period — avoid generic restaurant advice.

Respond using EXACTLY this structure with EXACTLY these section markers:

[SENTIMENT_INTERPRETATION]
Write 3-4 sentences describing the overall sentiment picture for this period. Reference the actual positive/neutral/negative percentages and average rating from the data block. State clearly whether the situation is positive, concerning, or mixed. Do not add percentages not in the data block.

[ROOT_CAUSE_ANALYSIS]
For each of the top 3 complaint categories, write a block in this format:
## <Category Name>
- **Pattern:** (describe the frequency and what it suggests from the reviews)
- **Likely Cause:** (operational issue this may indicate — use "may" / "suggests")
- **Business Impact:** (how this could affect reputation or revenue)

[ACTION_PLAN]
## Priority 1 — Immediate Action (within 48 hours)
- **Issue:** (specific issue from the data)
- **Recommended Action:** (specific, operational, not generic)
- **Expected Benefit:** (measurable outcome)

## Priority 2 — Short-Term Action (within 2 weeks)
- **Issue:** (specific issue from the data)
- **Recommended Action:** (specific, operational, not generic)
- **Expected Benefit:** (measurable outcome)

## Priority 3 — Continuous Improvement (ongoing)
- **Issue:** (specific issue from the data)
- **Recommended Action:** (specific, operational, not generic)
- **Expected Benefit:** (measurable outcome)

[FUTURE_OUTLOOK]
## Areas Requiring Continued Monitoring
- (bullet)
## Expected Focus Areas
- (bullet)
## Reputation Risks
- (bullet)
## Opportunities for Improvement
- (bullet)
## Recommended Review Monitoring
- (bullet)
"""

    if not settings.GEMINI_API_KEY:
        logger.warning("[ReportService] GEMINI_API_KEY not set — using fallback analysis")
        return _fallback_ai_analysis(data)

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name=settings.GEMINI_MODEL)
        response = await asyncio.to_thread(model.generate_content, prompt)
        raw = response.text
        return _parse_ai_response(raw, data)
    except Exception as e:
        logger.error(f"[ReportService] Gemini call failed: {e}")
        return _fallback_ai_analysis(data)


def _parse_ai_response(raw: str, data: dict) -> dict:
    """Extract the four sections from the structured Gemini response."""
    sections = {
        "sentiment_interpretation": "",
        "root_cause":               "",
        "action_plan":              "",
        "future_outlook":           "",
        "is_fallback":              False,
    }

    markers = [
        "[SENTIMENT_INTERPRETATION]",
        "[ROOT_CAUSE_ANALYSIS]",
        "[ACTION_PLAN]",
        "[FUTURE_OUTLOOK]",
    ]
    keys = ["sentiment_interpretation", "root_cause", "action_plan", "future_outlook"]

    for i, marker in enumerate(markers):
        start_idx = raw.find(marker)
        if start_idx == -1:
            continue
        content_start = start_idx + len(marker)
        if i + 1 < len(markers):
            next_idx = raw.find(markers[i + 1], content_start)
            content = raw[content_start:next_idx].strip() if next_idx != -1 else raw[content_start:].strip()
        else:
            content = raw[content_start:].strip()
        sections[keys[i]] = content

    # If any section is empty, fall back for that section only
    fallback = _fallback_ai_analysis(data)
    for key in keys:
        if not sections[key].strip():
            sections[key] = fallback[key]
            sections["is_fallback"] = True

    return sections


# ── Markdown to HTML ──────────────────────────────────────────────────────────

def _render_md(text: str, css_prefix: str = "ai") -> str:
    """
    Safe, limited markdown → HTML converter for AI-generated text.
    Escapes everything first, then applies only ## / - / ** patterns.
    """
    if not text or not text.strip():
        return f'<p class="{css_prefix}-muted">No content available.</p>'

    lines = [_esc(line) for line in text.strip().split("\n")]
    parts = []
    in_list = False

    for line in lines:
        s = line.strip()
        if not s:
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue
        if s.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f'<h3 class="{css_prefix}-h3">{s[3:].strip()}</h3>')
        elif s.startswith("- ") or s.startswith("• "):
            if not in_list:
                parts.append(f'<ul class="{css_prefix}-list">')
                in_list = True
            parts.append(f"<li>{s[2:].strip()}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f'<p class="{css_prefix}-p">{s}</p>')

    if in_list:
        parts.append("</ul>")

    html = "\n".join(parts)
    # **bold** → <strong>bold</strong>
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    return html


# ── HTML Template ─────────────────────────────────────────────────────────────

def _build_html(data: dict, ai: dict) -> str:
    r = data["restaurant"]
    generated = datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")
    date_range = (
        f'{data["range_start"].strftime("%d %b %Y")}'
        f' – '
        f'{data["range_end"].strftime("%d %b %Y")}'
    )
    avg_display = f'{data["avg_rating"]}★' if data["avg_rating"] else "—"
    total = data["total_reviews"]

    # Sentiment bar widths
    pos_w = data["sentiment_pct"]["positive"]
    neu_w = data["sentiment_pct"]["neutral"]
    neg_w = data["sentiment_pct"]["negative"]

    # Category bar chart HTML
    max_cat = max(data["category_counts"].values()) if data["category_counts"] else 1
    cat_bars = ""
    for cat in ALL_CATEGORIES:
        count = data["category_counts"].get(cat, 0)
        pct_of_max = round(count / max_cat * 100) if max_cat > 0 else 0
        pct_of_total = round(count / max(total, 1) * 100)
        color = CATEGORY_COLORS.get(cat, "#475569")
        cat_bars += f"""
        <div class="cat-row">
          <span class="cat-label">{_esc(cat)}</span>
          <div class="cat-track">
            <div class="cat-fill" style="width:{pct_of_max}%; background:{color};"></div>
          </div>
          <span class="cat-count">{count}</span>
          <span class="cat-pct">({pct_of_total}%)</span>
        </div>"""

    # AI section HTML
    sent_html = _render_md(ai["sentiment_interpretation"])
    rc_html = _render_md(ai["root_cause"])
    ap_html = _render_md(ai["action_plan"])
    fo_html = _render_md(ai["future_outlook"])

    fallback_badge = (
        '<span class="fallback-badge">Rule-Based (Gemini Unavailable)</span>'
        if ai.get("is_fallback") else
        '<span class="ai-badge">AI-Generated · Gemini</span>'
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Reputation Report — {_esc(r.name)}</title>
<style>
/* ── Reset & Page ── */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
@page {{
  size: A4;
}}
html {{ font-size: 12pt; }}
body {{
  font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
  color: #1e293b;
  background: #ffffff;
  line-height: 1.55;
  padding: 0 18mm;
}}

/* ── Section breaks ── */
.page-break {{ page-break-before: always; }}
.no-break {{ page-break-inside: avoid; }}

/* ═══════════════════════════════════════
   SECTION 1 — COVER
═══════════════════════════════════════ */
.cover {{
  padding: 10mm 0 8mm;
  border-bottom: 3px solid #0f172a;
  margin-bottom: 8mm;
}}
.cover-eyebrow {{
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4mm;
}}
.cover-title {{
  font-size: 22pt;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.15;
  margin-bottom: 6mm;
}}
.cover-accent {{ color: #d97706; }}
.cover-meta-grid {{
  display: flex;
  gap: 12mm;
  flex-wrap: wrap;
  margin-top: 4mm;
}}
.cover-meta-item {{}}
.cover-meta-label {{
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 1mm;
}}
.cover-meta-value {{
  font-size: 11pt;
  font-weight: 700;
  color: #0f172a;
}}
.cover-period-badge {{
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  padding: 2mm 5mm;
  border-radius: 3mm;
  font-size: 9pt;
  font-weight: 700;
  margin-top: 4mm;
}}
.generated-line {{
  font-size: 8pt;
  color: #94a3b8;
  margin-top: 3mm;
}}

/* ═══════════════════════════════════════
   SECTION HEADERS
═══════════════════════════════════════ */
.section-header {{
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-bottom: 5mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid #e2e8f0;
}}
.section-number {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 7mm;
  height: 7mm;
  background: #0f172a;
  color: #ffffff;
  font-size: 8pt;
  font-weight: 800;
  border-radius: 50%;
  flex-shrink: 0;
}}
.section-title {{
  font-size: 14pt;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}}
.section-subtitle {{
  font-size: 8.5pt;
  color: #64748b;
  margin-top: 0.5mm;
}}

/* ═══════════════════════════════════════
   SECTION 2 — KPI SUMMARY
═══════════════════════════════════════ */
.kpi-grid {{
  display: flex;
  flex-wrap: wrap;
  gap: 4mm;
  margin-bottom: 4mm;
}}
.kpi-card {{
  flex: 1 1 calc(25% - 4mm);
  min-width: 38mm;
  border: 1px solid #e2e8f0;
  border-radius: 3mm;
  padding: 4mm 4.5mm;
  background: #f8fafc;
}}
.kpi-label {{
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 1.5mm;
}}
.kpi-value {{
  font-size: 22pt;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
}}
.kpi-value.green {{ color: #065f46; }}
.kpi-value.red   {{ color: #991b1b; }}
.kpi-value.amber {{ color: #92400e; }}
.kpi-value.blue  {{ color: #1e3a5f; }}
.kpi-sub {{
  font-size: 8pt;
  color: #94a3b8;
  margin-top: 1mm;
}}

/* ═══════════════════════════════════════
   SECTION 3 — SENTIMENT INTERPRETATION
═══════════════════════════════════════ */
.sent-bar-wrap {{ margin: 4mm 0 3mm; }}
.sent-bar {{
  display: flex;
  height: 8mm;
  border-radius: 2mm;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}}
.sent-bar-seg {{ display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; color: #fff; }}
.sent-legend {{
  display: flex;
  gap: 8mm;
  margin-top: 2mm;
  font-size: 9pt;
}}
.sent-dot {{
  display: inline-block;
  width: 2.5mm;
  height: 2.5mm;
  border-radius: 50%;
  vertical-align: middle;
  margin-right: 1.5mm;
}}
.interp-box {{
  background: #f8fafc;
  border-left: 3px solid #d97706;
  padding: 3mm 4mm;
  border-radius: 0 2mm 2mm 0;
  margin-top: 3mm;
  font-size: 10.5pt;
  color: #334155;
  line-height: 1.6;
}}

/* ═══════════════════════════════════════
   SECTION 4 — COMPLAINT CATEGORY
═══════════════════════════════════════ */
.cat-row {{
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-bottom: 3mm;
}}
.cat-label {{
  width: 35mm;
  font-size: 9pt;
  color: #334155;
  font-weight: 600;
  flex-shrink: 0;
}}
.cat-track {{
  flex: 1;
  background: #f1f5f9;
  border-radius: 2mm;
  height: 5mm;
  overflow: hidden;
}}
.cat-fill {{
  height: 100%;
  border-radius: 2mm;
  transition: width 0s;
}}
.cat-count {{
  width: 10mm;
  text-align: right;
  font-size: 9pt;
  font-weight: 700;
  color: #0f172a;
}}
.cat-pct {{
  width: 12mm;
  font-size: 8pt;
  color: #64748b;
}}
.cat-note {{
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 2mm;
  padding: 2.5mm 3.5mm;
  font-size: 8.5pt;
  color: #78350f;
  margin-top: 3mm;
}}

/* ═══════════════════════════════════════
   AI SECTIONS (5, 6, 7)
═══════════════════════════════════════ */
.ai-box {{
  border: 1px solid #e2e8f0;
  border-radius: 3mm;
  padding: 5mm 6mm;
  background: #fafafa;
}}
.ai-badge {{
  display: inline-block;
  background: #ede9fe;
  color: #5b21b6;
  border: 1px solid #ddd6fe;
  padding: 1mm 3mm;
  border-radius: 2mm;
  font-size: 7.5pt;
  font-weight: 700;
  margin-bottom: 3mm;
}}
.fallback-badge {{
  display: inline-block;
  background: #fef9c3;
  color: #713f12;
  border: 1px solid #fde68a;
  padding: 1mm 3mm;
  border-radius: 2mm;
  font-size: 7.5pt;
  font-weight: 700;
  margin-bottom: 3mm;
}}
.ai-h3 {{
  font-size: 11pt;
  font-weight: 700;
  color: #1e293b;
  margin: 4mm 0 2mm;
  padding-bottom: 1mm;
  border-bottom: 1px dashed #e2e8f0;
}}
.ai-h3:first-child {{ margin-top: 1mm; }}
.ai-p {{
  font-size: 10pt;
  color: #334155;
  margin-bottom: 2mm;
  line-height: 1.6;
}}
.ai-list {{
  padding-left: 5mm;
  margin-bottom: 2mm;
}}
.ai-list li {{
  font-size: 10pt;
  color: #334155;
  margin-bottom: 1.5mm;
  line-height: 1.5;
}}
.ai-muted {{
  font-size: 9.5pt;
  color: #94a3b8;
  font-style: italic;
}}

/* ═══════════════════════════════════════
   FOOTER NOTE (inside body, above @page footer)
═══════════════════════════════════════ */
.report-footer {{
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 8pt;
  color: #94a3b8;
}}
.footer-left {{ line-height: 1.6; }}
.footer-right {{ text-align: right; line-height: 1.6; }}

/* Spacing utility */
.mt-4 {{ margin-top: 4mm; }}
.mt-6 {{ margin-top: 6mm; }}
.mt-8 {{ margin-top: 8mm; }}
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════
     SECTION 1 — REPORT COVER / HEADER
══════════════════════════════════════════════════════════════════ -->
<div class="cover no-break">
  <div class="cover-eyebrow">AI-Powered Restaurant Reputation Management Platform</div>
  <div class="cover-title">
    Restaurant Reputation<br>
    <span class="cover-accent">Intelligence Report</span>
  </div>
  <div class="cover-meta-grid">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Outlet / Restaurant</div>
      <div class="cover-meta-value">{_esc(r.name)}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Branch Code</div>
      <div class="cover-meta-value">{_esc(r.branch_code)}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">City</div>
      <div class="cover-meta-value">{_esc(r.city)}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Date Range</div>
      <div class="cover-meta-value">{date_range}</div>
    </div>
  </div>
  <div class="cover-period-badge">{_esc(data['period_label'])}</div>
  <div class="generated-line">Report generated on {generated} &nbsp;·&nbsp; First Fiddle Restaurants F&amp;B Group</div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 2 — KPI SUMMARY
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 no-break">
  <div class="section-header">
    <span class="section-number">2</span>
    <div>
      <div class="section-title">KPI Summary</div>
      <div class="section-subtitle">Key performance indicators for the selected outlet and reporting period</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card no-break">
      <div class="kpi-label">Total Reviews</div>
      <div class="kpi-value blue">{total}</div>
      <div class="kpi-sub">{date_range}</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Average Rating</div>
      <div class="kpi-value amber">{avg_display}</div>
      <div class="kpi-sub">out of 5.0 stars</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Positive Reviews</div>
      <div class="kpi-value green">{data['sentiment_counts']['positive']}</div>
      <div class="kpi-sub">{data['pos_pct']}% of total</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Neutral Reviews</div>
      <div class="kpi-value">{data['sentiment_counts']['neutral']}</div>
      <div class="kpi-sub">{data['neu_pct']}% of total</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Negative Reviews</div>
      <div class="kpi-value red">{data['sentiment_counts']['negative']}</div>
      <div class="kpi-sub">{data['neg_pct']}% of total</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Negative Rate</div>
      <div class="kpi-value {'red' if data['neg_pct'] > 30 else 'amber'}">{data['neg_pct']}%</div>
      <div class="kpi-sub">{'⚠ Needs attention' if data['neg_pct'] > 30 else 'Within acceptable range'}</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Top Complaint</div>
      <div class="kpi-value" style="font-size:13pt;">{_esc(data['top_category'])}</div>
      <div class="kpi-sub">most frequent category</div>
    </div>
    <div class="kpi-card no-break">
      <div class="kpi-label">Platform Coverage</div>
      <div class="kpi-value" style="font-size:11pt;">{_esc(data['platform_coverage'])}</div>
      <div class="kpi-sub">review sources</div>
    </div>
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 3 — SENTIMENT INTERPRETATION
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 page-break">
  <div class="section-header">
    <span class="section-number">3</span>
    <div>
      <div class="section-title">Sentiment Interpretation</div>
      <div class="section-subtitle">Distribution of customer sentiment and AI-generated interpretation</div>
    </div>
  </div>

  <div class="sent-bar-wrap no-break">
    <div class="sent-bar">
      <div class="sent-bar-seg" style="width:{pos_w}%; background:#065f46;" title="Positive {pos_w}%">
        {f'{pos_w}%' if pos_w >= 8 else ''}
      </div>
      <div class="sent-bar-seg" style="width:{neu_w}%; background:#475569;" title="Neutral {neu_w}%">
        {f'{neu_w}%' if neu_w >= 8 else ''}
      </div>
      <div class="sent-bar-seg" style="width:{neg_w}%; background:#991b1b;" title="Negative {neg_w}%">
        {f'{neg_w}%' if neg_w >= 8 else ''}
      </div>
    </div>
    <div class="sent-legend">
      <span><span class="sent-dot" style="background:#065f46;"></span> Positive — {data['sentiment_counts']['positive']} reviews ({pos_w}%)</span>
      <span><span class="sent-dot" style="background:#475569;"></span> Neutral — {data['sentiment_counts']['neutral']} reviews ({neu_w}%)</span>
      <span><span class="sent-dot" style="background:#991b1b;"></span> Negative — {data['sentiment_counts']['negative']} reviews ({neg_w}%)</span>
    </div>
  </div>

  <div class="interp-box no-break">
    {sent_html}
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 4 — COMPLAINT CATEGORY ANALYSIS
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 page-break">
  <div class="section-header">
    <span class="section-number">4</span>
    <div>
      <div class="section-title">Complaint Category Analysis</div>
      <div class="section-subtitle">Frequency of complaint mentions by category across all analyzed reviews</div>
    </div>
  </div>

  {cat_bars}

  <div class="cat-note no-break">
    <strong>Note:</strong> Category counts represent individual complaint <em>mentions</em>, not unique reviews.
    A single review may reference multiple complaint categories simultaneously.
    Therefore the sum of category counts may exceed the total review count of {total}.
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 5 — ROOT-CAUSE ANALYSIS
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 page-break">
  <div class="section-header">
    <span class="section-number">5</span>
    <div>
      <div class="section-title">Complaint Root-Cause Analysis</div>
      <div class="section-subtitle">Patterns, operational implications, and business impact — based on actual review data</div>
    </div>
  </div>
  <div class="ai-box">
    {fallback_badge}
    {rc_html}
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 6 — AI-GENERATED ACTION PLAN
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 page-break">
  <div class="section-header">
    <span class="section-number">6</span>
    <div>
      <div class="section-title">AI-Generated Action Plan</div>
      <div class="section-subtitle">Prioritized recommendations derived from the review patterns above</div>
    </div>
  </div>
  <div class="ai-box">
    {fallback_badge}
    {ap_html}
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 7 — FUTURE OUTLOOK
══════════════════════════════════════════════════════════════════ -->
<div class="section-block mt-8 page-break">
  <div class="section-header">
    <span class="section-number">7</span>
    <div>
      <div class="section-title">Future Outlook</div>
      <div class="section-subtitle">Monitoring priorities, reputation risks, and improvement opportunities</div>
    </div>
  </div>
  <div class="ai-box">
    {fallback_badge}
    {fo_html}
  </div>
</div>


<!-- ═══════════════════════════════════════════════════════════════
     SECTION 8 — REPORT FOOTER
══════════════════════════════════════════════════════════════════ -->
<div class="report-footer">
  <div class="footer-left">
    <strong>{_esc(r.name)}</strong> · {_esc(r.branch_code)} · {_esc(r.city)}<br>
    {_esc(data['period_label'])}&nbsp;·&nbsp;{date_range}
  </div>
  <div class="footer-right">
    AI-Powered Restaurant Review &amp; Reputation Management Platform<br>
    First Fiddle Restaurants F&amp;B Group&nbsp;·&nbsp;Generated {generated}
  </div>
</div>

</body>
</html>"""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_report_pdf(restaurant_id: str, period: str, db: Prisma) -> bytes:
    """
    Aggregate review data, generate AI analysis, build HTML, render PDF.
    This is the sole public function called by the FastAPI router.
    """
    data = await _aggregate_report_data(restaurant_id, period, db)
    ai = await _generate_ai_analysis(data)
    html = _build_html(data, ai)

    restaurant_name = data["restaurant"].name
    period_label = data["period_label"]

    footer_html = (
        f'<div style="width:100%; font-family:\'Segoe UI\', Helvetica, Arial, sans-serif; '
        f'font-size:8px; color:#94a3b8; display:flex; justify-content:space-between; '
        f'padding:0 18mm; box-sizing:border-box;">'
        f'<span>{_esc(restaurant_name)} &middot; {_esc(period_label)}</span>'
        f'<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>'
        f'</div>'
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="load")
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                display_header_footer=True,
                header_template="<span></span>",
                footer_template=footer_html,
                margin={"top": "15mm", "bottom": "14mm", "left": "0", "right": "0"},
            )
            return pdf_bytes
        finally:
            await browser.close()