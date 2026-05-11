import json, os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

DATA_FILE = "/Users/nadavminkowitz/Jarvis/pdf_data.json"
OUTPUT = "/Users/nadavminkowitz/Jarvis/public/jewish-ethics-study-guide.pdf"

with open(DATA_FILE) as f:
    data = json.load(f)

NAVY = colors.HexColor("#0A1628")
GOLD = colors.HexColor("#C9A84C")
DEEP_BLUE = colors.HexColor("#1B3A6B")
LIGHT_GOLD = colors.HexColor("#F5E6C0")
WHITE = colors.white
LIGHT_GRAY = colors.HexColor("#F4F6FA")
MID_GRAY = colors.HexColor("#888888")
DARK_TEXT = colors.HexColor("#1A1A1A")
GREEN_C = colors.HexColor("#1A7A4A")
RED_C = colors.HexColor("#8B1A1A")
ACCENT = colors.HexColor("#2C5F8A")
PURPLE = colors.HexColor("#5C2D8A")

COLOR_MAP = {"NAVY": NAVY, "DEEP_BLUE": DEEP_BLUE, "GREEN": GREEN_C, "RED": RED_C}

doc = SimpleDocTemplate(OUTPUT, pagesize=letter,
    rightMargin=0.6*inch, leftMargin=0.6*inch,
    topMargin=0.6*inch, bottomMargin=0.6*inch)

title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=28,
    textColor=WHITE, alignment=TA_CENTER, spaceAfter=4, leading=34)
subtitle_style = ParagraphStyle("Subtitle", fontName="Helvetica", fontSize=13,
    textColor=LIGHT_GOLD, alignment=TA_CENTER, spaceAfter=2)
section_style = ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=14,
    textColor=WHITE, alignment=TA_LEFT, spaceAfter=2, leading=18)
body_style = ParagraphStyle("Body", fontName="Helvetica", fontSize=10,
    textColor=DARK_TEXT, alignment=TA_JUSTIFY, spaceAfter=4, leading=15)
bold_body = ParagraphStyle("BoldBody", fontName="Helvetica-Bold", fontSize=10,
    textColor=DARK_TEXT, spaceAfter=3, leading=14)
qa_q_style = ParagraphStyle("QAQ", fontName="Helvetica-Bold", fontSize=11,
    textColor=DEEP_BLUE, spaceAfter=3, leading=15)
qa_a_style = ParagraphStyle("QAA", fontName="Helvetica", fontSize=10,
    textColor=DARK_TEXT, spaceAfter=2, leading=14, leftIndent=10)
cheat_key = ParagraphStyle("CheatKey", fontName="Helvetica-Bold", fontSize=10,
    textColor=colors.HexColor("#7B5A00"), spaceAfter=1)
cheat_val = ParagraphStyle("CheatVal", fontName="Helvetica", fontSize=9,
    textColor=DARK_TEXT, spaceAfter=3, leftIndent=8, leading=13)
meta_style = ParagraphStyle("meta", fontName="Helvetica", fontSize=9, textColor=MID_GRAY, alignment=TA_CENTER)
num_style = ParagraphStyle("num", fontName="Helvetica-Bold", fontSize=12, textColor=WHITE, alignment=TA_CENTER)

def sec_hdr(text, bg=DEEP_BLUE):
    data = [[Paragraph(text, section_style)]]
    t = Table(data, colWidths=[7.3*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("TOPPADDING", (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LEFTPADDING", (0,0), (-1,-1), 14),
    ]))
    return t

def qa_card(q, a):
    d = [[Paragraph("Q: " + q, qa_q_style)], [Paragraph("A: " + a, qa_a_style)]]
    t = Table(d, colWidths=[7.1*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), colors.HexColor("#E8EFF7")),
        ("BACKGROUND", (0,1), (0,1), colors.HexColor("#FAFAFA")),
        ("BOX", (0,0), (-1,-1), 1, ACCENT),
        ("LINEBELOW", (0,0), (0,0), 0.5, ACCENT),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    return t

story = []

# COVER
for txt, style, pad_top, pad_bot in [
    ("JEWISH ETHICS AND LAW", title_style, 28, 6),
    ("Complete Study Guide", subtitle_style, 2, 28),
]:
    cd = [[Paragraph(txt, style)]]
    ct = Table(cd, colWidths=[7.3*inch])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("TOPPADDING", (0,0), (-1,-1), pad_top),
        ("BOTTOMPADDING", (0,0), (-1,-1), pad_bot),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(ct)
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Based on Peter Kreeft Lectures and Class Notes on Jewish Ethics and Law", meta_style))
story.append(Spacer(1, 0.2*inch))

# SECTION 1: CONCEPTS
story.append(sec_hdr("SECTION 1: KEY CONCEPTS AND DEFINITIONS", NAVY))
story.append(Spacer(1, 0.1*inch))
for term, defn in data["concepts"]:
    row = [[Paragraph(term, bold_body), Paragraph(defn, body_style)]]
    t = Table(row, colWidths=[1.8*inch, 5.5*inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
        ("BACKGROUND", (0,0), (0,0), LIGHT_GOLD),
        ("BACKGROUND", (1,0), (1,0), LIGHT_GRAY),
    ]))
    story.append(t)
story.append(Spacer(1, 0.2*inch))

# SECTION 2: RULES
story.append(PageBreak())
story.append(sec_hdr("SECTION 2: MOST IMPORTANT RULES AND PRINCIPLES", DEEP_BLUE))
story.append(Spacer(1, 0.12*inch))
for num, rule, color_key in data["rules"]:
    c = COLOR_MAP.get(color_key, DEEP_BLUE)
    row = [[Paragraph(num, num_style), Paragraph(rule, body_style)]]
    t = Table(row, colWidths=[0.35*inch, 6.95*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), c),
        ("BACKGROUND", (1,0), (1,0), LIGHT_GRAY),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, colors.HexColor("#CCCCCC")),
    ]))
    story.append(t)
story.append(Spacer(1, 0.2*inch))

# Athens vs Jerusalem
story.append(sec_hdr("ATHENS vs. JERUSALEM: THE TWO MORAL PARADIGMS", PURPLE))
story.append(Spacer(1, 0.1*inch))
ath_hdr = ParagraphStyle("ah", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, alignment=TA_CENTER)
jer_hdr = ParagraphStyle("jh", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, alignment=TA_CENTER)
comp_rows = [
    [Paragraph("ATHENS (Reason-Centric)", ath_hdr), Paragraph("JERUSALEM (Faith-Centric)", jer_hdr)],
    [Paragraph("Morality derived from human reason", body_style), Paragraph("Morality derived from God (transcendent source)", body_style)],
    [Paragraph("Accepted exposing sickly infants as rational public good", body_style), Paragraph("Every human life is intrinsically precious (Imago Dei)", body_style)],
    [Paragraph("The ends justify the means", body_style), Paragraph("The means justify the ends", body_style)],
    [Paragraph("Ethics can change with logic and circumstance", body_style), Paragraph("God's law is eternal and never changes", body_style)],
    [Paragraph("Compliance through rational self-interest", body_style), Paragraph("Compliance through reverence and gratitude", body_style)],
]
comp_t = Table(comp_rows, colWidths=[3.65*inch, 3.65*inch])
comp_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (0,0), colors.HexColor("#C0392B")),
    ("BACKGROUND", (1,0), (1,0), GREEN_C),
    ("BACKGROUND", (0,1), (0,-1), colors.HexColor("#FDECEA")),
    ("BACKGROUND", (1,1), (1,-1), colors.HexColor("#E8F5EE")),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CCCCCC")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 10),
    ("RIGHTPADDING", (0,0), (-1,-1), 10),
]))
story.append(comp_t)
story.append(Spacer(1, 0.2*inch))
# SECTION 3: TEST QUESTIONS
story.append(PageBreak())
story.append(sec_hdr("SECTION 3: LIKELY TEST QUESTIONS AND ANSWERS", colors.HexColor("#1A5C3A")))
story.append(Spacer(1, 0.12*inch))
for q, a in data["qas"]:
    story.append(qa_card(q, a))
    story.append(Spacer(1, 0.08*inch))
story.append(Spacer(1, 0.1*inch))

# SECTION 4: CHEAT SHEET
story.append(PageBreak())
story.append(sec_hdr("SECTION 4: QUICK REFERENCE CHEAT SHEET", GOLD))
story.append(Spacer(1, 0.12*inch))

cheat_data = [
    ("CORE VOCABULARY", [
        ("Ethics / Morals", "Rules defining right vs. wrong"),
        ("Ethical Monotheism", "One God = source of morality + human ethics are primary"),
        ("Tora", "To teach, guide, instruct. A compass, not a cage"),
        ("Misvot", "Legal instructions, NOT commandments. No coercion from God"),
        ("Imago Dei", "Every human made in God's image = inviolable worth"),
        ("Objective Morality", "Right/wrong exists independently of opinion"),
        ("Relativism", "Morality as subjective. REJECTED by Judaism"),
    ]),
    ("THE 5 FAILED SECULAR MORAL FOUNDATIONS", [
        ("1. Evolution", "Describes change, not improvement. Relative, not fixed"),
        ("2. Reason", "Morally neutral tool. Can justify evil just as easily"),
        ("3. Conscience", "Subjective and fallible. Himmler used it to justify murder"),
        ("4. Human Nature", "The very thing morality must RESTRAIN, not follow"),
        ("5. Utilitarianism", "Can justify slavery if majority benefits. No inviolable limits"),
    ]),
    ("JUDAISM vs. SECULAR WORLD", [
        ("Means vs. Ends", "Judaism: Means Justify Ends | Secular: Ends Justify Means"),
        ("Enforcement", "Judaism: Reverence and gratitude | Secular: Fear and coercion"),
        ("Source of Ethics", "Judaism: God (unchanging) | Secular: Humans (fallible, shifting)"),
        ("Freedom", "Judaism: Self-control = freedom | Secular: Do whatever you want"),
        ("Evil", "Judaism: Call it EVIL | Secular: Call it irrational"),
    ]),
    ("GOLDEN RULES TO MEMORIZE", [
        ("Rule 1", "God is the ONLY reliable source of morality"),
        ("Rule 2", "Reason is a TOOL, not a moral compass"),
        ("Rule 3", "Values must OVERRIDE feelings. Always."),
        ("Rule 4", "Misvot = instructions, never commandments"),
        ("Rule 5", "True freedom = moral self-discipline"),
        ("Rule 6", "Human life has absolute, inviolable worth (Imago Dei)"),
        ("Rule 7", "In Judaism: The MEANS justify the Ends"),
        ("Rule 8", "God's laws NEVER change. Human ethics drift."),
        ("Rule 9", "Jewish ethics enforced by love and gratitude, NEVER fear"),
        ("Rule 10", "Name evil as EVIL, not irrational or madness"),
    ]),
    ("KEY EXAMPLES TO KNOW", [
        ("Holocaust Rescuers", "Did NOT act rationally. Acted on moral principle above reason"),
        ("Drowning Dog vs. Stranger", "Hierarchy of value. Human life above pet affection"),
        ("Himmler and Conscience", "Shows conscience alone is unreliable"),
        ("90%/10% Slavery", "Shows utilitarianism can justify atrocities"),
        ("Athens: Infanticide", "Reason-based morality with no inviolable limits"),
        ("Liberty Bell", "American founding anchored freedom in biblical moral law"),
        ("Junk Food / Health", "Values (health) must override impulse (taste)"),
        ("Academic Cheating", "Values (integrity) must override impulse (easy grade)"),
    ]),
]

hdr_cs = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY)
for section_title, items in cheat_data:
    hd = [[Paragraph(section_title, hdr_cs)]]
    ht = Table(hd, colWidths=[7.3*inch])
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LIGHT_GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("LINEBELOW", (0,0), (-1,-1), 1.5, GOLD),
    ]))
    story.append(ht)
    for key, val in items:
        row = [[Paragraph(key, cheat_key), Paragraph(val, cheat_val)]]
        rt = Table(row, colWidths=[1.9*inch, 5.4*inch])
        rt.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 12),
            ("LINEBELOW", (0,0), (-1,-1), 0.3, colors.HexColor("#E0E0E0")),
            ("BACKGROUND", (0,0), (-1,-1), colors.white),
        ]))
        story.append(rt)
    story.append(Spacer(1, 0.12*inch))

story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))
footer_s = ParagraphStyle("footer", fontName="Helvetica", fontSize=8, textColor=MID_GRAY, alignment=TA_CENTER)
story.append(Paragraph("Study Guide compiled from Peter Kreeft lectures and class notes on Jewish Ethics and Law", footer_s))

doc.build(story)
print("PDF created:", OUTPUT)