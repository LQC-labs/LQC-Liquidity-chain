"""Build a review-only PDF from docs/LQC_WHITEPAPER_CANONICAL.md.

Usage: python scripts/build_whitepaper_v14_review.py
Requires: reportlab. This script does not publish/deploy anything.
Do not use the historical v4.7/v5.3 builders for the current V1.4 PDF.
"""
from pathlib import Path
import re
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, LongTable, TableStyle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/LQC_WHITEPAPER_CANONICAL.md'
OUTPUT = ROOT / 'output/pdf/LQC_Whitepaper_V1.4_Review_Edition.pdf'
text = SOURCE.read_text(encoding='utf-8')
section = text.split('## 14. Canonical Tokenomics', 1)[1].split('## 15. Development', 1)[0]
rows = []
for line in section.splitlines():
    if line.startswith('|') and 'LQC ' in line:
        parts = [p.strip() for p in line.strip('|').split('|')]
        if len(parts) == 6 and parts[2].endswith('%'):
            rows.append((parts[1], float(parts[2][:-1]), int(parts[3].replace(',','')), int(parts[4].replace(',',''))))
assert len(rows) == 9 and len({r[0] for r in rows}) == 9, 'Expected nine unique allocation wallets'
assert abs(sum(r[1] for r in rows)-100) < 0.00001, 'Allocation total must be 100%'
assert sum(r[2] for r in rows) == 1_000_000_000, 'Wrong fixed supply'
assert sum(r[3] for r in rows) == 143_800_000, 'Wrong TGE target'
assert '120 months' in section and '24 monthly releases' in section, 'Old vesting baseline detected'

regular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
assert Path(regular).exists() and Path(bold).exists(), 'DejaVu Sans TTF is required'
pdfmetrics.registerFont(TTFont('LQC', regular))
pdfmetrics.registerFont(TTFont('LQC-Bold', bold))
pdfmetrics.registerFontFamily('LQC', normal='LQC', bold='LQC-Bold')
navy=colors.HexColor('#172B3D'); teal=colors.HexColor('#00A58E')
pale=colors.HexColor('#F4F7F8'); light=colors.HexColor('#E5F4F0')
muted=colors.HexColor('#647583'); linecolor=colors.HexColor('#DCE4E9')
w,h=A4; margin=46; content_width=w-2*margin
styles = {
 'h2':ParagraphStyle('H2',fontName='LQC-Bold',fontSize=14.4,leading=20,spaceBefore=12,spaceAfter=7,textColor=navy,keepWithNext=True),
 'h3':ParagraphStyle('H3',fontName='LQC-Bold',fontSize=10.3,leading=15,spaceBefore=9,spaceAfter=4,textColor=navy,keepWithNext=True),
 'body':ParagraphStyle('Body',fontName='LQC',fontSize=8.45,leading=13.4,spaceAfter=7,textColor=navy),
 'item':ParagraphStyle('Item',fontName='LQC',fontSize=8.25,leading=12.6,leftIndent=13,firstLineIndent=-9,spaceAfter=5,textColor=navy),
 'th':ParagraphStyle('TH',fontName='LQC-Bold',fontSize=6.5,leading=9.2,textColor=colors.white),
 'td':ParagraphStyle('TD',fontName='LQC',fontSize=6.6,leading=9.7,textColor=navy),
 'small':ParagraphStyle('Small',fontName='LQC',fontSize=8,leading=13,textColor=muted),
}
def fmt(value):
    value=escape(value.strip())
    value=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',value)
    return value

def table_block(lines):
    grid=[]
    for line in lines:
        cells=[x.strip() for x in line.strip('|').split('|')]
        if all(re.fullmatch(r':?-{2,}:?', c) for c in cells):continue
        grid.append(cells)
    if not grid:return None
    assert len(grid[0]) == 6, 'The canonical allocation table must have six columns'
    widths=[80,88,34,72,72,content_width-346]
    data=[[Paragraph(fmt(c),styles['th'] if i==0 else styles['td']) for c in row] for i,row in enumerate(grid)]
    t=LongTable(data,colWidths=widths,repeatRows=1,hAlign='LEFT',splitByRow=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('ROWBACKGROUNDS',(0,1),(-1,-2),[colors.white,pale]),('BACKGROUND',(0,-1),(-1,-1),light),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    return t

items=[]; buffer=[]; lines_table=[]; headings=[]
def flush():
    if buffer:
        items.append(Paragraph(fmt(' '.join(buffer)),styles['body'])); buffer.clear()
def flush_table():
    if lines_table:
        items.append(table_block(lines_table)); items.append(Spacer(1,9)); lines_table.clear()
for raw in text.splitlines():
    s=raw.strip()
    if s.startswith('|'):
        flush(); lines_table.append(s); continue
    flush_table()
    if not s:flush();continue
    if s.startswith('# '):flush();continue
    if s.startswith('## '):
        flush(); headings.append(s[3:]); items.append(Paragraph(fmt(s[3:]),styles['h2']));continue
    if s.startswith('### '):
        flush();items.append(Paragraph(fmt(s[4:]),styles['h3']));continue
    if s.startswith('- '):
        flush();items.append(Paragraph('• '+fmt(s[2:]),styles['item']));continue
    if re.match(r'^\d+\. ',s) and headings and headings[-1].startswith('18. '):
        flush();items.append(Paragraph(fmt(s),styles['item']));continue
    buffer.append(s)
flush();flush_table()
assert len(headings) == 19, f'Expected 19 whitepaper sections, got {len(headings)}'

def cover(c, doc):
    c.setFillColor(navy);c.rect(0,0,w,h,stroke=0,fill=1)
    c.setFillColor(teal);c.rect(0,h-22,w,22,stroke=0,fill=1)
    c.setFillColor(colors.HexColor('#275967'));c.circle(w+38,h-250,205,stroke=0,fill=1)
    c.setFillColor(colors.white);c.setFont('LQC-Bold',29);c.drawString(52,h-222,'LQC WHITEPAPER')
    c.setFont('LQC',13);c.drawString(52,h-253,'Liquidity & Execution Ecosystem')
    c.setFillColor(colors.HexColor('#C9E6E5'));c.setFont('LQC',9.5);c.drawString(52,h-302,'BSC-first development  |  Future native LQC mainnet')
    c.setFillColor(colors.white);c.setFont('LQC-Bold',15);c.drawString(52,h-392,'TOKENOMICS V1.4  |  REVIEW EDITION')
    c.setFont('LQC',10);c.drawString(52,h-420,'21 October 2026  |  1,000,000,000 LQC fixed supply')
    c.drawString(52,h-445,'TGE maximum planned transferability: 143,800,000 LQC (14.38%)')
    c.setFillColor(colors.HexColor('#C9E6E5'));c.setFont('LQC',8.8)
    c.drawString(52,116,'NOT A RELEASED OR INDEPENDENTLY AUDITED WHITEPAPER')
    c.drawString(52,96,'No token issuance, CEX listing or regulatory approval claimed.')
    c.drawString(52,76,'Source: docs/LQC_WHITEPAPER_CANONICAL.md')

def frame(c,doc):
    c.saveState()
    c.setStrokeColor(linecolor);c.line(margin,h-39,w-margin,h-39);c.line(margin,42,w-margin,42)
    c.setFillColor(navy);c.setFont('LQC-Bold',8);c.drawString(margin,h-27,'LQC / WHITEPAPER')
    c.setFillColor(teal);c.drawRightString(w-margin,h-27,'V1.4 REVIEW')
    c.setFillColor(muted);c.setFont('LQC',7)
    c.drawString(margin,27,'Canonical source · tokenomics V1.4 · 21 October 2026')
    c.drawRightString(w-margin,27,f'{doc.page:02d}')
    c.restoreState()

contents=[Paragraph('CONTENTS',styles['h2']),Spacer(1,6)]
contents.extend(Paragraph(fmt(x),styles['body']) for x in headings)
contents.append(Paragraph('Review copy: prior PDF generation scripts and public website require separate reconciliation before release.',styles['small']))
story=[PageBreak(),*contents,PageBreak(),*items]
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(OUTPUT),pagesize=A4,leftMargin=margin,rightMargin=margin,topMargin=58,bottomMargin=53,title='LQC Whitepaper V1.4 Review',author='MMXlabs&LQC LLC')
doc.build(story,onFirstPage=cover,onLaterPages=frame)
print('Generated:', OUTPUT, 'bytes:', OUTPUT.stat().st_size)
