from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import os

OUTPUT = '/Users/nadavminkowitz/Jarvis/public/jewish-ethics-study-guide.pdf'

NAVY = colors.HexColor('#0A1628')
GOLD = colors.HexColor('#C9A84C')
DEEP_BLUE = colors.HexColor('#1B3A6B')
LIGHT_GOLD = colors.HexColor('#F5E6C0')
WHITE = colors.white
LIGHT_GRAY = colors.HexColor('#F4F6FA')
MID_GRAY = colors.HexColor('#888888')
DARK_TEXT = colors.HexColor('#1A1A1A')
GREEN = colors.HexColor('#1A7A4A')
RED = colors.HexColor('#8B1A1A')
ACCENT = colors.HexColor('#2C5F8A')

doc = SimpleDocTemplate(OUTPUT, pagesize=letter,
    rightMargin=0.6*inch, leftMargin=0.6*inch,
    topMargin=0.6*inch, bottomMargin=0.6*inch)

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', fontName='Helvetica-Bold', fontSize=28,
    textColor=WHITE, alignment=TA_CENTER, spaceAfter=4, leading=34)
subtitle_style = ParagraphStyle('Subtitle', fontName='Helvetica', fontSize=13,
    textColor=LIGHT_GOLD, alignment=TA_CENTER, spaceAfter=2)
section_style = ParagraphStyle('Section', fontName='Helvetica-Bold', fontSize=14,
    textColor=WHITE, alignment=TA_LEFT, spaceAfter=2, leading=18)
body_style = ParagraphStyle('Body', fontName='Helvetica', fontSize=10,
    textColor=DARK_TEXT, alignment=TA_JUSTIFY, spaceAfter=4, leading=15)
bold_body = ParagraphStyle('BoldBody', fontName='Helvetica-Bold', fontSize=10,
    textColor=DARK_TEXT, spaceAfter=3, leading=14)
bullet_style = ParagraphStyle('Bullet', fontName='Helvetica', fontSize=10,
    textColor=DARK_TEXT, leftIndent=14, spaceAfter=3, leading=14, bulletIndent=4)
qa_q_style = ParagraphStyle('QAQ', fontName='Helvetica-Bold', fontSize=11,
    textColor=DEEP_BLUE, spaceAfter=3, leading=15)
qa_a_style = ParagraphStyle('QAA', fontName='Helvetica', fontSize=10,
    textColor=DARK_TEXT, spaceAfter=2, leading=14, leftIndent=10)
cheat_key = ParagraphStyle('CheatKey', fontName='Helvetica-Bold', fontSize=10,
    textColor=GOLD, spaceAfter=1)
cheat_val = ParagraphStyle('CheatVal', fontName='Helvetica', fontSize=9,
    textColor=DARK_TEXT, spaceAfter=3, leftIndent=8, leading=13)

def section_header(text, bg=DEEP_BLUE):
    data = [[Paragraph(text, section_style)]]
    t = Table(data, colWidths=[7.3*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('TOPPADDING', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 9),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
    ]))
    return t

def gold_box(content_list):
    inner = [[item] for item in content_list]
    rows = []
    for item in content_list:
        rows.append([item])
    data = rows
    t = Table(data, colWidths=[7.1*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_GOLD),
        ('BOX', (0,0), (-1,-1), 1.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    return t

def qa_card(q, a):
    data = [
        [Paragraph('Q: ' + q, qa_q_style)],
        [Paragraph('A: ' + a, qa_a_style)],
    ]
    t = Table(data, colWidths=[7.1*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#E8EFF7')),
        ('BACKGROUND', (0,1), (0,1), colors.HexColor('#FAFAFA')),
        ('BOX', (0,0), (-1,-1), 1, ACCENT),
        ('LINEBELOW', (0,0), (0,0), 0.5, ACCENT),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    return t

story = []

# ===== COVER PAGE =====
cover_data = [[Paragraph('JEWISH ETHICS &amp; LAW', title_style)]]
cover_table = Table(cover_data, colWidths=[7.3*inch])
cover_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), NAVY),
    ('TOPPADDING', (0,0), (-1,-1), 28),
    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
]))
story.append(cover_table)

sub_data = [[Paragraph('Complete Study Guide', subtitle_style)]]
sub_table = Table(sub_data, colWidths=[7.3*inch])
sub_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), NAVY),
    ('TOPPADDING', (0,0), (-1,-1), 2),
    ('BOTTOMPADDING', (0,0), (-1,-1), 28),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
]))
story.append(sub_table)
story.append(Spacer(1, 0.18*inch))

meta_data = [
    [Paragraph('Based on Peter Kreeft Lectures + Class Notes', ParagraphStyle('meta', fontName='Helvetica', fontSize=9, textColor=MID_GRAY, alignment=TA_CENTER))],
]
meta_table = Table(meta_data, colWidths=[7.3*inch])
meta_table.setStyle(TableStyle([
    ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2),
]))
story.append(meta_table)
story.append(Spacer(1, 0.2*inch))

# ===== SECTION 1: KEY CONCEPTS & DEFINITIONS =====
story.append(section_header('SECTION 1: KEY CONCEPTS & DEFINITIONS', NAVY))
story.append(Spacer(1, 0.1*inch))

concepts = [
    ('Ethics & Morals', 'The set of rules, ideas, and principles that define the difference between right and wrong.'),
    ('Ethical Monotheism', 'The belief that a single God is the transcendent source of objective morality AND that His primary demand is ethical conduct toward other human beings — not ritual service.'),
    ('Objective Morality', 'Moral standards that are real and binding regardless of personal opinion, culture, or era. They exist independently of human preference.'),
    ('Tora (Torah)', 'Literally means "to teach, guide, instruct." The Tora is not a restrictive law code but a guide for living freely and well in God's world. It is the Jewish moral compass.'),
    ('Misvot (Mitzvot)', 'Translated as legal responsibilities or legal instructions — NOT commandments. God never coerces. They are a framework for functioning happily and freely in God's world, keeping emotions from overriding intelligence.'),
    ('Imago Dei', 'The belief that every human being is made in the image of God — grounding the absolute, inviolable worth of every human life.'),
    ('Values', 'The decision-making tools for every task in life. Values override impulses and feelings. Without strong values, society degrades into theft, violence, and chaos.'),
    ('Reason (as a tool)', 'A morally neutral instrument that can be aimed at good OR evil. Reason optimizes for whatever goal is set — it does not supply the goal or its moral legitimacy.'),
    ('The Enlightenment Fallacy', 'The incorrect belief that reason alone leads to a good world and that evil is "irrational." In reality, evil often proceeds through calculated, rational logic.'),
    ('Relativism', 'The view that morality is subjective or culturally determined. Jewish thought rejects this — morality is objective and divine in origin, not subject to change.'),
]

for term, defn in concepts:
    row = [[Paragraph(term, bold_body), Paragraph(defn, body_style)]]
    t = Table(row, colWidths=[1.8*inch, 5.5*inch])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('BACKGROUND', (0,0), (0,0), LIGHT_GOLD),
        ('BACKGROUND', (1,0), (1,0), LIGHT_GRAY),
    ]))
    story.append(t)

story.append(Spacer(1, 0.2*inch))

# ===== SECTION 2: MOST IMPORTANT RULES & LAWS =====
story.append(PageBreak())
story.append(section_header('SECTION 2: MOST IMPORTANT RULES & PRINCIPLES TO KNOW', DEEP_BLUE))
story.append(Spacer(1, 0.12*inch))

rules = [
    ('1', 'God — not Moses, not any human — is the SOLE source and issuer of the moral code.', NAVY),
    ('2', 'The Tora's purpose is to GUIDE, not restrict. It enables freedom through moral self-control.', DEEP_BLUE),
    ('3', 'Jewish ethics are NEVER enforced through fear or coercion. We follow them out of reverence and gratitude.', GREEN),
    ('4', 'God's primary demand: treat other humans ethically. Human-to-human ethics ranks ABOVE ritual service to God.', NAVY),
    ('5', 'Misvot = Legal instructions/responsibilities — NOT commandments. There is no "submit or else."', DEEP_BLUE),
    ('6', 'Reason is a TOOL, not a moral compass. It can justify both good and evil. Never treat rationality as morality.', RED),
    ('7', 'In Judaism: THE MEANS JUSTIFY THE ENDS. In secular society: "The ends justify the means." This is the key distinction.', GREEN),
    ('8', 'If you do not choose the system of God, you default to the system of fallible, selfish humans.', RED),
    ('9', 'God and His Laws NEVER change. Human-derived ethics shift with culture, power, and self-interest.', NAVY),
    ('10', 'Values must OVERRIDE feelings/impulses. The best people fight their impulses daily and choose values.', DEEP_BLUE),
    ('11', 'Every human life has unique, intrinsic preciousness (Imago Dei). No utilitarian calculus can override this.', GREEN),
    ('12', 'The Ten Commandments (Aseret HaDibrot) are rooted in LIBERATION — God cites the Exodus, not creation, to establish moral authority.', NAVY),
    ('13', 'Freedom is not permissiveness. True freedom = moral self-control. Commandments are guardrails that ENABLE freedom.', DEEP_BLUE),
    ('14', 'Fear is used by human leaders to make people surrender control and obey immoral orders. God's system needs no fear.', RED),
    ('15', 'Evil must be called "evil" — not "irrational." Mislabeling it as irrational externalizes blame and obscures agency.', RED),
]

for num, rule, color in rules:
    row = [[Paragraph(num, ParagraphStyle('num', fontName='Helvetica-Bold', fontSize=12, textColor=WHITE, alignment=TA_CENTER)), Paragraph(rule, body_style)]]
    t = Table(row, colWidths=[0.35*inch, 6.95*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), color),
        ('BACKGROUND', (1,0), (1,0), LIGHT_GRAY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
    ]))
    story.append(t)

story.append(Spacer(1, 0.2*inch))

# Athens vs Jerusalem callout
story.append(section_header('ATHENS vs. JERUSALEM: THE TWO MORAL PARADIGMS', colors.HexColor('#5C2D8A')))
story.append(Spacer(1, 0.1*inch))

compare_data = [
    [Paragraph('ATHENS (Reason-Centric)', ParagraphStyle('ah', fontName='Helvetica-Bold', fontSize=11, textColor=WHITE, alignment=TA_CENTER)),
     Paragraph('JERUSALEM (Faith-Centric)', ParagraphStyle('jh', fontName='Helvetica-Bold', fontSize=11, textColor=WHITE, alignment=TA_CENTER))],
    [Paragraph('Morality derived from human reason', body_style),
     Paragraph('Morality derived from God (transcendent source)', body_style)],
    [Paragraph('Accepted exposing sickly infants as rational public good', body_style),
     Paragraph('Every human life is intrinsically precious (Imago Dei)', body_style)],
    [Paragraph('The ends justify the means', body_style),
     Paragraph('The means justify the ends', body_style)],
    [Paragraph('Ethics can change with logic and circumstance', body_style),
     Paragraph('God's law is eternal and never changes', body_style)],
    [Paragraph('Compliance through rational self-interest', body_style),
     Paragraph('Compliance through reverence and gratitude', body_style)],
]
comp_t = Table(compare_data, colWidths=[3.65*inch, 3.65*inch])
comp_t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (0,0), colors.HexColor('#C0392B')),
    ('BACKGROUND', (1,0), (1,0), colors.HexColor('#1A7A4A')),
    ('BACKGROUND', (0,1), (0,-1), colors.HexColor('#FDECEA')),
    ('BACKGROUND', (1,1), (1,-1), colors.HexColor('#E8F5EE')),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FDECEA'), colors.HexColor('#FDECEA')]),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('TOPPADDING', (0,0), (-1,-1), 7),
    ('BOTTOMPADDING', (0,0), (-1,-1), 7),
    ('LEFTPADDING', (0,0), (-1,-1), 10),
    ('RIGHTPADDING', (0,0), (-1,-1), 10),
]))
story.append(comp_t)
story.append(Spacer(1, 0.2*inch))

# ===== SECTION 3: LIKELY TEST QUESTIONS & ANSWERS =====
story.append(PageBreak())
story.append(section_header('SECTION 3: LIKELY TEST QUESTIONS & ANSWERS', colors.HexColor('#1A5C3A')))
story.append(Spacer(1, 0.12*inch))

qas = [
    ('What are ethics and morals?',
     'The set of rules, ideas, and principles that define the difference between right and wrong.'),

    ('What is Ethical Monotheism and what are its two pillars?',
     'Ethical Monotheism is the Jewish concept that (1) God is the single transcendent source of objective morality, and (2) God's primary demand is ethical conduct toward other humans — not ritual service.'),

    ('What is the difference between Jewish ethics and secular (non-Jewish) ethics?',
     'Jewish ethics are sourced from God (the Torah), who is the infallible Creator of humans. Secular ethics are derived from fallible, self-interested humans or shifting human reason. God's laws never change; human-derived ethics do.'),

    ('Why is reason NOT a reliable foundation for morality?',
     'Reason is a morally neutral tool — it can be used to plan both charity and murder equally effectively. It optimizes for whatever goal you set, without providing a moral goal. Evil acts (e.g., genocide, infanticide) can be logically justified through reason.'),

    ('What does the phrase "The Means Justify the Ends" mean in Judaism?',
     'In Judaism, HOW you do something matters as much as the outcome. You cannot commit an immoral act to achieve a moral goal. This contrasts with secular thinking where "the ends justify the means" — any means is acceptable if the outcome is good.'),

    ('Why does God cite the Exodus (Egypt) in the first commandment rather than the creation of the world?',
     'Because power alone (creating the world) is impressive but does not establish trust. Care and liberation (freeing slaves from Egypt) establishes a relationship of moral obligation. It also signals God's hatred of slavery and the primacy of freedom.'),

    ('What is the correct translation of "Misvot" and why does it matter?',
     'Misvot means "legal responsibilities" or "legal instructions" — NOT commandments. The word "commandment" implies coercion ("submit or else"), but God never forces compliance. Misvot are tools that help us function freely and happily in God's world.'),

    ('Why are Jewish ethics NOT enforced through fear?',
     'Because God's system is designed to benefit the individual. There is no need for coercion when the system genuinely helps you. We follow it out of reverence and gratitude. Fear is a human leadership tool used to make people submit to immoral orders.'),

    ('What is the danger of calling evil "irrational" instead of "evil"?',
     'It externalizes blame, obscures moral agency, and allows organizations to drift into amoral pragmatism. Leaders must diagnose evil correctly as evil — not "madness" — in order to establish clear moral boundaries.'),

    ('Why does utilitarianism fail as a moral system?',
     'Utilitarianism (greatest good for greatest number) can justify gross injustice — e.g., if 90% of a population benefits from enslaving the other 10%, utilitarianism calls it moral. This is objectively wrong. It has no inviolable moral limits.'),

    ('Why does evolution fail as a source of morality?',
     'Evolution only describes change, not improvement. If morality is merely evolving, it is relative. We need a standard ABOVE evolutionary trends to judge whether change is "good" or "bad." Without such a standard, we cannot condemn past atrocities.'),

    ('What is the purpose of the Tora?',
     'The Tora's purpose is to teach, guide, and instruct — not to restrict. It provides a compass for living freely and well in God's world, keeping emotions from overwhelming intelligence.'),

    ('What is the purpose of morals and ethics in society?',
     'To create a stable society that protects people from conflict-induced violence, division, and chaos. Without widely practiced moral values, trust collapses and communities become unsafe.'),

    ('What does "values over feelings" mean and why is it important?',
     'Our impulses and feelings pull toward immediate gratification, which often leads to destructive outcomes (theft, violence, dishonesty). Values impose higher-order constraints. The "best people" are those who fight their impulses daily and consistently choose values.'),

    ('Give three examples of values overriding impulses.',
     '(1) Health discipline: choosing not to eat junk food to preserve health. (2) Life triage: saving a drowning stranger over a drowning dog because human life has unique value. (3) Academic integrity: choosing not to cheat even when you might not get caught.'),

    ('What is the connection between freedom and the Ten Commandments?',
     'True freedom is not permissiveness but moral self-control. The commandments are guardrails that ENABLE a free society, not constrain it. Freedom without moral discipline decays into chaos. The American Liberty Bell inscription reflects this: "proclaim liberty throughout all the land."'),

    ('Why is conscience an unreliable sole source of morality?',
     'Conscience is subjective and fallible. Himmler appealed to his subordinates' consciences to compel them to commit mass murder. Without an objective standard above individual conscience, there is no basis to say one person's conscience is right and another's wrong.'),
]

for q, a in qas:
    story.append(qa_card(q, a))
    story.append(Spacer(1, 0.08*inch))

story.append(Spacer(1, 0.1*inch))

# ===== SECTION 4: QUICK REFERENCE CHEAT SHEET =====
story.append(PageBreak())
story.append(section_header('SECTION 4: QUICK REFERENCE CHEAT SHEET', GOLD))
story.append(Spacer(1, 0.12*inch))

cheat_sections = [
    ('CORE VOCABULARY', [
        ('Ethics/Morals', 'Rules defining right vs. wrong'),
        ('Ethical Monotheism', 'One God = source of morality + human ethics are primary'),
        ('Tora', 'To teach, guide, instruct — a compass, not a cage'),
        ('Misvot', 'Legal instructions (NOT commandments) — no coercion'),
        ('Imago Dei', 'Every human made in God's image = inviolable worth'),
        ('Objective Morality', 'Right/wrong exists independently of opinion'),
        ('Relativism', 'Morality as subjective — REJECTED by Judaism'),
    ]),
    ('THE 5 FAILED SECULAR MORAL FOUNDATIONS', [
        ('1. Evolution', 'Describes change, not improvement — relative, not fixed'),
        ('2. Reason', 'Morally neutral tool — can justify evil just as easily'),
        ('3. Conscience', 'Subjective & fallible — Himmler used it to justify murder'),
        ('4. Human Nature', 'The very thing morality must RESTRAIN, not follow'),
        ('5. Utilitarianism', 'Can justify slavery if majority benefits — no inviolable limits'),
    ]),
    ('JUDAISM vs. SECULAR WORLD — KEY CONTRASTS', [
        ('Means vs. Ends', 'Judaism: Means Justify Ends | Secular: Ends Justify Means'),
        ('Enforcement', 'Judaism: Reverence & gratitude | Other: Fear & coercion'),
        ('Source of Ethics', 'Judaism: God (unchanging) | Other: Humans (fallible, shifting)'),
        ('Freedom', 'Judaism: Self-control = freedom | Other: Do whatever you want'),
        ('Evil', 'Judaism: Call it EVIL | Secular: Call it "irrational"'),
    ]),
    ('GOLDEN RULES TO MEMORIZE', [
        ('Rule 1', 'God is the ONLY reliable source of morality'),
        ('Rule 2', 'Reason is a TOOL, not a moral compass'),
        ('Rule 3', 'Values must OVERRIDE feelings — always'),
        ('Rule 4', 'Misvot = instructions, never commandments'),
        ('Rule 5', 'True freedom = moral self-discipline'),
        ('Rule 6', 'Human life has absolute, inviolable worth (Imago Dei)'),
        ('Rule 7', 'In Judaism: The MEANS justify the Ends'),
        ('Rule 8', 'God's laws NEVER change; human ethics drift'),
        ('Rule 9', 'Jewish ethics enforced by love/gratitude — NEVER fear'),
        ('Rule 10', 'Name evil as EVIL — not "irrational" or "madness"'),
    ]),
    ('EXAMPLES TO KNOW', [
        ('Holocaust Rescuers', 'Did NOT act rationally — acted on moral principle above reason'),
        ('Drowning Dog vs. Stranger', 'Hierarchy of value — human life above pet affection'),
        ('Himmler & Conscience', 'Shows conscience alone is unreliable'),
        ('90%/10% Slavery', 'Shows utilitarianism can justify atrocities'),
        ('Athens: Infanticide', 'Reason-based morality with no inviolable limits'),
        ('Liberty Bell', 'American founding anchored freedom in biblical moral law'),
        ('Junk Food & Health', 'Values (health) must override impulse (taste)'),
        ('Academic Cheating', 'Values (integrity) must override impulse (easy grade)'),
    ]),
]

for section_title, items in cheat_sections:
    hdr_data = [[Paragraph(section_title, ParagraphStyle('ch', fontName='Helvetica-Bold', fontSize=11, textColor=NAVY))]]
    hdr_t = Table(hdr_data, colWidths=[7.3*inch])
    hdr_t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('LINEBELOW', (0,0), (-1,-1), 1.5, GOLD),
    ]))
    story.append(hdr_t)
    for key, val in items:
        row = [[Paragraph(key, cheat_key), Paragraph(val, cheat_val)]]
        rt = Table(row, colWidths=[1.9*inch, 5.4*inch])
        rt.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('LINEBELOW', (0,0), (-1,-1), 0.3, colors.HexColor('#E0E0E0')),
            ('BACKGROUND', (0,0), (-1,-1), colors.white),
        ]))
        story.append(rt)
    story.append(Spacer(1, 0.12*inch))

# Footer note
story.append(HRFlowable(width='100%', thickness=1, color=GOLD, spaceAfter=8))
footer = Paragraph('Study Guide compiled from Peter Kreeft lectures and class notes on Jewish Ethics &amp; Law', 
    ParagraphStyle('footer', fontName='Helvetica', fontSize=8, textColor=MID_GRAY, alignment=TA_CENTER))
story.append(footer)

doc.build(story)
print('PDF created successfully:', OUTPUT)
