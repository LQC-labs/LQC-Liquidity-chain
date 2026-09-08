from io import BytesIO
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "LQC_Whitepaper.pdf"
OUT = ROOT / "output/pdf/LQC_Whitepaper_v4.7_September_2026.pdf"
ADDENDUM = ROOT / "tmp/pdfs/development_update.pdf"

NAVY = HexColor("#142331")
TEAL = HexColor("#0b7f86")
MINT = HexColor("#21b8a6")
LIGHT = HexColor("#e8f5f4")
MID = HexColor("#607482")
LINE = HexColor("#b9d9d7")

pdfmetrics.registerFont(TTFont("LQCSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("LQCSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", parent=styles["Normal"], fontName="LQCSans-Bold", fontSize=8, leading=10, textColor=TEAL, spaceAfter=8))
styles.add(ParagraphStyle(name="TitleX", parent=styles["Title"], fontName="LQCSans-Bold", fontSize=23, leading=27, textColor=NAVY, alignment=TA_LEFT, spaceAfter=14))
styles.add(ParagraphStyle(name="H1X", parent=styles["Heading1"], fontName="LQCSans-Bold", fontSize=18, leading=22, textColor=NAVY, spaceBefore=6, spaceAfter=10))
styles.add(ParagraphStyle(name="H2X", parent=styles["Heading2"], fontName="LQCSans-Bold", fontSize=12, leading=15, textColor=TEAL, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyX", parent=styles["BodyText"], fontName="LQCSans", fontSize=9.2, leading=13.2, textColor=NAVY, spaceAfter=7))
styles.add(ParagraphStyle(name="SmallX", parent=styles["BodyText"], fontName="LQCSans", fontSize=7.5, leading=10, textColor=MID))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="LQCSans-Bold", fontSize=9.4, leading=13.2, textColor=NAVY, backColor=LIGHT, borderColor=LINE, borderWidth=.6, borderPadding=8, spaceAfter=10))

def P(text, style="BodyX"):
    return Paragraph(text, styles[style])

def table(rows, widths):
    t = Table([[P(str(c), "SmallX") for c in r] for r in rows], colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), LIGHT), ("TEXTCOLOR", (0,0), (-1,0), NAVY),
        ("FONTNAME", (0,0), (-1,0), "LQCSans-Bold"), ("GRID", (0,0), (-1,-1), .45, LINE),
        ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

def footer(c, doc):
    c.saveState()
    c.setStrokeColor(LINE); c.line(54, 34, 558, 34)
    c.setFont("LQCSans", 7); c.setFillColor(MID)
    c.drawString(54, 21, "LQC | LIQUIDITY CHAIN")
    c.drawRightString(558, 21, f"Development Update | Whitepaper v4.7 | {doc.page}")
    c.restoreState()

def cover_page():
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=letter)
    c.setFillColor(MID); c.setFont("LQCSans-Bold", 10)
    c.drawString(72, 744, "LQC  |  LIQUIDITY CHAIN")
    c.setFillColor(NAVY); c.setFont("LQCSans-Bold", 26)
    c.drawString(72, 650, "LQC Whitepaper")
    c.setFillColor(TEAL); c.setFont("LQCSans-Bold", 16)
    c.drawString(72, 612, "Modular Global Liquidity Infrastructure")
    c.setFillColor(NAVY); c.setFont("LQCSans", 11)
    c.drawString(72, 584, "Connecting Fragmented Web3 Liquidity")
    c.setFillColor(LIGHT); c.roundRect(72, 515, 468, 48, 5, fill=1, stroke=0)
    c.setFillColor(NAVY); c.setFont("LQCSans-Bold", 10)
    c.drawString(86, 542, "Version 4.7 - English Working Draft - September 2026")
    c.setFont("LQCSans", 9)
    c.drawString(86, 525, "Issued by MMXlabs&LQC LLC | Wyoming, United States")
    notice = P("<b>Document Notice</b><br/><br/>This technical and business working draft distinguishes confirmed project direction from engineering baselines and unresolved external evidence. It does not guarantee a launch, exchange listing, partnership, revenue, token price or investment return.", "BodyX")
    notice.wrapOn(c, 440, 120); notice.drawOn(c, 86, 374)
    status = table([
        ["Classification", "Meaning"],
        ["Confirmed direction", "An adopted project objective, principle or disclosure standard."],
        ["Engineering baseline", "Repository implementation that may change after audit, simulation or testing."],
        ["Pending evidence", "Requires deployment, independent review, on-chain proof or formal approval."],
    ], [120, 320])
    status.wrapOn(c, 440, 160); status.drawOn(c, 86, 190)
    c.setStrokeColor(LINE); c.line(72, 48, 540, 48)
    c.setFillColor(MID); c.setFont("LQCSans", 7)
    c.drawString(72, 32, "MMXlabs&LQC LLC  ·  Whitepaper v4.7  ·  English Working Draft")
    c.drawRightString(540, 32, "1")
    c.save(); packet.seek(0)
    return PdfReader(packet).pages[0]

story = [
    P("TECHNICAL DEVELOPMENT UPDATE", "Kicker"),
    P("Router 2.0, LQC Flow DEX and BSC Testnet Readiness", "TitleX"),
    P("Version 4.7 - English Working Draft - September 2026", "Callout"),
    P("This update forms part of the LQC Whitepaper and records repository-verified implementation progress completed after the August 2026 working draft. It does not represent an audit, mainnet launch, production integration, exchange listing, or guarantee of future performance."),
    P("Update classification", "H1X"),
    table([
        ["Classification", "Meaning in this update"],
        ["Implemented", "Code and automated tests are present in the public repository."],
        ["Testnet-oriented", "Designed for controlled BSC testnet deployment and validation."],
        ["Pending", "Requires production addresses, parameters, audit, governance approval, monitoring, and legal review."],
    ], [120, 384]),
    Spacer(1, 12),
    P("1. Development snapshot", "H1X"),
    table([
        ["Component", "Repository status", "Current scope"],
        ["LQC Flow AMM", "Implemented", "Factory, pair, LP accounting, token/BNB liquidity, exact-input and exact-output swaps, multi-hop paths."],
        ["Router 2.0", "Implemented testnet MVP", "Adapter registry, quote isolation, best-route selection, split optimization, atomic execution."],
        ["PancakeSwap V2", "Adapter implemented", "Reviewed-address registration and protected exact-input execution."],
        ["PancakeSwap V3", "Quote and execution adapters implemented", "Validated packed paths, reviewed fee tiers and pools, maximum three hops."],
        ["Native BNB routing", "Implemented", "Wrap/unwrap around protected token execution without retained user balances."],
        ["Risk and governance controls", "Implemented testnet foundation", "Timelock, emergency disable, allowlists, transaction and UTC-day caps."],
        ["Production deployment", "Pending", "Audit, final multisig, oracle feeds, limits, monitoring, legal review and capped pilot."],
    ], [105, 105, 294]),
    PageBreak(),
    P("ROUTER 2.0", "Kicker"), P("2. Protocol-neutral routing architecture", "TitleX"),
    P("Router 2.0 separates discovery, quoting, optimization, execution, risk limits and emergency authority. New EVM DEXs can be integrated through reviewed protocol-specific adapters without replacing the shared router stack."),
    table([
        ["Contract", "Implemented responsibility"],
        ["LQCDexRegistry", "Stores approved adapters, route status and deterministic priority."],
        ["LQCQuoteRouter", "Compares enabled adapters; isolates failed quote calls; applies priority tie-breaking."],
        ["LQCSplitOptimizer", "Builds capped candidate allocations and exact output totals across one to four routes."],
        ["LQCAutoRouter", "Selects single or split execution and derives route-level minimum outputs from user slippage tolerance."],
        ["LQCExecutionRouter", "Executes exact-input token swaps with deadline, minimum-output, recipient-balance verification, temporary exact approvals and reentrancy protection."],
        ["LQCGasCostOracle", "Converts estimated BNB gas into output-token units after freshness and deviation checks."],
        ["LQCNativeRouter", "Wraps and unwraps native BNB without retaining user balances."],
    ], [140, 364]),
    Spacer(1, 12),
    P("2.1 Route selection logic", "H1X"),
    P("Enabled execution adapters are quoted independently. Failed DEX quotes are excluded instead of reverting the entire comparison. The router compares expected output after caller-supplied gas cost, applies deterministic registry priority to ties, and executes only through active adapters."),
    P("For optimized execution, the system may select one route or an atomic split across two to four routes. User slippage tolerance is converted into per-route minimum-output protection. Tolerance above the configured 20% ceiling is rejected. If any later split leg fails, the whole transaction reverts and restores balances and pool state.", "Callout"),
    P("2.2 Adapter admission", "H1X"),
    P("Protocol neutrality does not mean automatic compatibility. Each DEX requires a protocol-specific quote adapter, execution adapter, path validation, tests, address review and security review before registry activation. Non-EVM connectivity remains a later cross-chain layer."),
    PageBreak(),
    P("EXECUTION AND RISK", "Kicker"), P("3. Implemented controls and trust boundaries", "TitleX"),
    table([
        ["Control", "Implemented behavior", "Boundary"],
        ["DEX activation", "Only enabled registry adapters may quote or execute.", "Governance-controlled expansion."],
        ["Minimum output", "Transactions revert when protected output is not met.", "Depends on user tolerance and quote integrity."],
        ["Deadline", "Expired execution requests are rejected.", "Does not remove market volatility."],
        ["Approvals", "Exact temporary approvals are cleared after execution.", "Token-specific edge cases remain subject to review."],
        ["Atomic split", "Any failed leg reverts the complete optimized swap.", "Gas cost may rise with route count."],
        ["Timelock", "Structural registry and risk expansion is delayed.", "Production target policy remains 48 hours; testnet bootstrap may use one hour."],
        ["Emergency controller", "Guardians may disable one DEX or pause new swaps immediately.", "Guardians cannot resume, re-enable, move user funds, mint, or expand limits."],
        ["Risk registry", "Token allowlists and per-DEX, per-transaction and UTC-day caps.", "Risk multisig may reduce, not expand, limits."],
    ], [102, 245, 157]),
    Spacer(1, 12),
    P("3.1 Gas-aware comparison", "H1X"),
    P("The gas-cost oracle validates primary and secondary price freshness and permitted deviation before converting estimated BNB gas into the output-token denomination. This allows comparison by estimated net output rather than gross quote alone."),
    P("Production feed addresses, heartbeat windows, deviation thresholds and fallback policy are not finalized. Gas-adjusted selection is an engineering capability, not a guarantee of best realized execution.", "Callout"),
    P("3.2 Custody principle", "H1X"),
    P("The routing contracts are designed not to retain residual user balances after execution. Native BNB handling is limited to controlled wrapping and unwrapping around the protected token route."),
    PageBreak(),
    P("TESTING AND DEPLOYMENT", "Kicker"), P("4. Verification completed and gates remaining", "TitleX"),
    P("The reproducible repository baseline compiles 35 Solidity source files and reports 53 passing automated tests. The suite covers AMM behavior, Router 2.0 logic, risk controls and deployment wiring. The CI result for the exact reviewed commit remains the authoritative evidence."),
    table([
        ["Verification area", "Evidence represented in repository tests"],
        ["AMM invariants", "Reserve accounting and non-decreasing constant-product checks across deterministic state changes."],
        ["Split invariants", "Exact allocation/output totals and one-to-four-route caps."],
        ["Atomic rollback", "A later adapter failure restores user balances, pool reserves and zero router/adapter custody."],
        ["Unsupported token behavior", "Fee-on-transfer input is rejected without retained balances, consumed approval or risk-accounting residue."],
        ["BSC testnet bootstrap", "Pool creation, Router 2.0 quoting, capped smoke swap and minimum-output rejection."],
        ["Deployment validation", "Chain ID 97 safety, deployed bytecode, Router-to-Factory relationships, registry order, adapter status, module linkage and risk ceilings."],
    ], [145, 359]),
    Spacer(1, 14),
    P("4.1 Deployment status", "H1X"),
    P("Deployment tooling targets BSC testnet (chain ID 97). It can deploy test tokens, LQC Flow AMM components and Router 2.0, register the LQC Flow adapter, and optionally register reviewed PancakeSwap V2 or V3 addresses supplied at deployment time."),
    P("No production-readiness claim", "H2X"),
    P("The implementation remains an unaudited testnet MVP. Fee-on-transfer and rebasing token execution, permit signatures, protocol-fee accounting, LQC fee conversion and burning, production oracle feeds and audited production integrations are intentionally unsupported or deferred."),
    P("Required before mainnet use", "H2X"),
    P("Independent audits; invariant and fuzz expansion; economic simulation; final multisig and timelock assignment; production oracle configuration; token, pool and fee-tier allowlists; monitoring and incident procedures; capped-liquidity pilot; and legal and regulatory review."),
    PageBreak(),
    P("AUDIT AND CEX READINESS", "Kicker"), P("5. Reproducible evidence and submission gaps", "TitleX"),
    P("The repository now includes an audit scope, audit handoff, security test matrix and centralized-exchange listing readiness register. These materials organize evidence and unresolved work; they do not represent audit approval, legal approval or an exchange-listing decision."),
    table([
        ["Evidence area", "Current status", "Submission requirement"],
        ["Build and tests", "Repository verified", "Pin the exact commit, locked dependencies, compiler settings, command output and CI run."],
        ["Explorer package", "Generator implemented", "Validate the real chain-97 deployment and publish matching verified source, addresses and transactions."],
        ["Independent audit", "Pending", "Named auditor, pinned scope/commit, final report, remediation commits and retest of every Critical/High finding."],
        ["Token on-chain proof", "Pending", "Canonical address, decimals, supply controls, holders, deployment transaction, vesting and privileged-role evidence."],
        ["Governance operations", "Pending production proof", "Final multisig threshold, role assignments, timelock, emergency procedure and drill evidence."],
        ["Market evidence", "Not claimed", "Timestamped liquidity, TVL, volume, holders and active-wallet methodology; no unsupported metrics."],
        ["Legal/compliance", "Pending external evidence", "Entity/KYB package, legal analysis, sanctions/AML and market-integrity controls."],
    ], [112, 112, 280]),
    Spacer(1, 12),
    P("5.1 Reproducible explorer verification", "H1X"),
    P("The BscScan preparation tool generates Standard JSON input, compiler and optimizer settings, constructor arguments, deployed addresses and the recorded source revision from a BSC testnet deployment record. Publication remains deployment-specific and must match the reviewed commit exactly."),
    P("5.2 Submission consistency gate", "H1X"),
    P("The whitepaper, website, repository, token contract, vesting schedules, Treasury records and exchange application must use identical supply, allocation and status statements. Every on-chain claim must identify its network, contract address, transaction or block height and evidence date.", "Callout"),
    PageBreak(),
    P("WHITEPAPER ALIGNMENT", "Kicker"), P("6. Impact on the LQC roadmap", "TitleX"),
    table([
        ["Roadmap layer", "September 2026 interpretation"],
        ["Foundation", "Router, registry, AMM, access and testnet deployment foundations are implemented in repository code."],
        ["Router MVP", "Multi-adapter quotes, gas-aware comparison, split optimization and protected execution have reached unaudited testnet MVP status."],
        ["Controlled integration", "LQC Flow plus PancakeSwap V2/V3 adapter paths are implemented; production addresses and live activation remain gated."],
        ["Lending", "Whitepaper design remains future scope; production lending contracts, oracle configuration and economic validation are not claimed by this update."],
        ["Cross-chain", "Remains phased future scope. Non-EVM liquidity is not assumed compatible with EVM adapters."],
        ["Perpetual trading", "Remains a planned module subject to separate liquidity, oracle, margin, liquidation, audit and legal validation."],
    ], [130, 374]),
    Spacer(1, 14),
    P("6.1 Token utility boundary", "H1X"),
    P("Router and AMM development does not by itself activate LQC fee conversion, lending-fee burning, staking rewards, governance rights or production Treasury flows. Those utilities remain subject to contract completion, audit, parameter approval and on-chain disclosure."),
    P("6.2 Current tokenomics disclosure", "H1X"),
    P("The current approved project design uses a fixed maximum supply of 1,000,000,000 LQC and planned TGE circulation of 150,000,000 LQC (15%). Contract enforcement, canonical token address, allocation wallets, vesting contracts and circulating-supply evidence remain pending and must be reconciled before launch."),
    P("6.3 Legal entity and public documentation", "H1X"),
    P("The project's disclosed legal entity is MMXlabs&amp;LQC LLC, a Wyoming limited liability company. Current formation, good-standing, ownership, signatory, KYB and legal-opinion evidence must be delivered through each reviewer's approved process."),
    Spacer(1, 8),
    P("Development conclusion", "H1X"),
    P("LQC has progressed from router architecture into a broader, testable EVM routing stack with native AMM integration, external DEX adapters, gas-aware selection, atomic split execution and staged risk controls. The next milestone is not unrestricted production deployment; it is controlled BSC testnet validation under final governance, oracle, monitoring and audit preparation.", "Callout"),
]

ADDENDUM.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(ADDENDUM), pagesize=letter, rightMargin=54, leftMargin=54, topMargin=48, bottomMargin=48)
doc.build(story, onFirstPage=footer, onLaterPages=footer)

reader = PdfReader(str(SOURCE))
add = PdfReader(str(ADDENDUM))
writer = PdfWriter()
base_pages = []
for page in reader.pages:
    if "TECHNICAL DEVELOPMENT UPDATE" in (page.extract_text() or ""):
        break
    base_pages.append(page)
for idx, page in enumerate(base_pages):
    if idx == 0:
        writer.add_page(cover_page())
        continue
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=letter)
    c.setFillColor(white); c.rect(54, 16, 504, 38, fill=1, stroke=0)
    c.setFillColor(MID); c.setFont("Helvetica", 6.8)
    c.drawString(72, 28, "MMXlabs&LQC LLC  ·  Whitepaper v4.7  ·  English Working Draft")
    c.drawRightString(540, 28, str(idx + 1))
    c.save(); packet.seek(0)
    page.merge_page(PdfReader(packet).pages[0])
    writer.add_page(page)
for page in add.pages:
    writer.add_page(page)
writer.add_metadata({"/Title":"LQC Whitepaper v4.7 - September 2026","/Author":"MMXlabs&LQC LLC","/Subject":"Liquidity Chain technical and business working draft with Router 2.0, audit and CEX-readiness update"})
OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("wb") as f:
    writer.write(f)
print(OUT)
