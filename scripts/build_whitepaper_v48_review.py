from pathlib import Path
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import utils
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/LQC_Whitepaper_v5.0_Review_Edition.pdf"
NAVY = HexColor("#102235")
TEAL = HexColor("#0b8790")
MINT = HexColor("#31c7ad")
LIGHT = HexColor("#e9f6f5")
MID = HexColor("#607789")
LINE = HexColor("#b7d9d8")

pdfmetrics.registerFont(TTFont("LQCSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("LQCSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

BODY = ParagraphStyle("body", fontName="LQCSans", fontSize=9.2, leading=14, textColor=NAVY, spaceAfter=9)
SMALL = ParagraphStyle("small", fontName="LQCSans", fontSize=7.6, leading=10.5, textColor=NAVY)
BULLET = ParagraphStyle("bullet", parent=BODY, leftIndent=14, firstLineIndent=-8, bulletIndent=0, spaceAfter=6)
CALLOUT = ParagraphStyle("callout", parent=BODY, fontName="LQCSans-Bold", backColor=LIGHT, borderColor=LINE, borderWidth=.6, borderPadding=9)


def para(text, style=BODY):
    return Paragraph(text, style)


def draw_header(c, number, kicker, title):
    c.setFillColor(MID); c.setFont("LQCSans-Bold", 8)
    c.drawString(54, 752, kicker.upper())
    c.setFillColor(NAVY); c.setFont("LQCSans-Bold", 20)
    title_obj = Paragraph(title, ParagraphStyle("page_title", fontName="LQCSans-Bold", fontSize=20, leading=24, textColor=NAVY))
    _, h = title_obj.wrap(504, 60); title_obj.drawOn(c, 54, 738-h)
    c.setStrokeColor(MINT); c.setLineWidth(2); c.line(54, 704-h, 150, 704-h)
    return 688-h


def draw_footer(c, number):
    c.setStrokeColor(LINE); c.setLineWidth(.5); c.line(54, 38, 558, 38)
    c.setFillColor(MID); c.setFont("LQCSans", 6.8)
    c.drawString(54, 23, "MMXlabs&LQC LLC  ·  LQC Whitepaper v5.0  ·  Review Edition")
    c.drawRightString(558, 23, str(number))


def draw_blocks(c, y, blocks):
    for block in blocks:
        if isinstance(block, tuple) and block[0] == "table":
            rows, widths = block[1], block[2]
            data = [[para(str(cell), SMALL) for cell in row] for row in rows]
            obj = Table(data, colWidths=widths, repeatRows=1)
            obj.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("FONTNAME", (0, 0), (-1, 0), "LQCSans-Bold"),
                ("GRID", (0, 0), (-1, -1), .45, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
        elif isinstance(block, tuple) and block[0] == "callout":
            obj = para(block[1], CALLOUT)
        elif isinstance(block, tuple) and block[0] == "bullets":
            for item in block[1]:
                obj = para("• " + item, BULLET)
                _, h = obj.wrap(504, y-52); y -= h; obj.drawOn(c, 54, y); y -= 4
            continue
        else:
            obj = para(block)
        _, h = obj.wrap(504, y-52)
        if y-h < 50:
            raise RuntimeError("Page content overflow")
        y -= h; obj.drawOn(c, 54, y); y -= 10


pages = [
    ("Executive summary", "1. Executive Summary", [
        "Liquidity Chain (LQC) is a modular infrastructure project for connecting fragmented liquidity across decentralized exchanges and, in later phases, across blockchain ecosystems. The initial engineering focus is an EVM routing stack and LQC Flow automated market maker for controlled BNB Smart Chain testnet validation.",
        "The public repository includes protocol-neutral adapter registration, failure-isolated quotes, gas-aware route comparison, one-to-four-route split optimization, atomic protected execution, native BNB handling, risk limits, emergency controls and testnet deployment validation.",
        ("callout", "Current status: unaudited testnet MVP. No production deployment, live liquidity, exchange listing, audit approval or guaranteed commercial outcome is claimed."),
        ("bullets", ["Liquidity first - utility second - revenue third - scale last.", "Security gates precede unrestricted deployment.", "Every material claim should be independently verifiable."]),
    ]),
    ("Project overview", "2. The Liquidity Fragmentation Problem", [
        "Liquidity is distributed across exchanges, pools, fee tiers, networks and assets. A visible quoted price may not represent the best executable result once depth, price impact, pool fees, gas and failure risk are considered.",
        "Users and applications often perform fragmented discovery and submit an order to one venue. This can produce unnecessary slippage, failed execution and inconsistent operational controls.",
        ("table", [["Fragmentation", "Resulting challenge"], ["Many venues", "Quotes and interfaces differ"], ["Uneven depth", "Price impact varies by order size"], ["Different networks", "Assets and messages require separate security assumptions"], ["Operational risk", "Paused or compromised routes must be isolated"]], [145,359]),
    ]),
    ("Project overview", "3. LQC's Proposed Response", [
        "LQC separates route discovery, optimization, execution and risk control into auditable modules. Reviewed adapters translate protocol-specific behavior into a shared interface while the registry determines which integrations are eligible.",
        "The objective is to compare executable outcomes, support direct and multi-hop paths, split larger orders when justified, and apply protection before funds are sent to an external venue.",
        ("bullets", ["Multi-DEX liquidity aggregation", "Gas- and slippage-aware route selection", "Atomic single or split execution", "Staged limits and emergency disable controls", "Public deployment and verification evidence"]),
    ]),
    ("Design principles", "4. Product and Governance Principles", [
        ("table", [["Principle", "Application"], ["Liquidity first", "Prioritize executable depth and measurable routing quality"], ["Modularity", "Separate failure domains and integration responsibilities"], ["Least privilege", "Divide governance, emergency and risk authority"], ["Evidence", "Pin code, settings, addresses and on-chain state"], ["Phased launch", "Use testnet, caps and independent review before expansion"]], [125,379]),
        "No single private key should control token supply, treasury, oracle, bridge, upgrades and emergency authority. Production roles and signers remain subject to final disclosure and review.",
    ]),
    ("Architecture", "5. Modular Protocol Architecture", [
        ("table", [["Layer", "Responsibility", "Status"], ["AMM", "Pools, LP accounting, token/BNB swaps", "Testnet MVP"], ["Registry", "Approved adapters and route state", "Implemented"], ["Quote", "Failure-isolated comparison", "Implemented"], ["Optimization", "Capped single/split allocation", "Implemented"], ["Execution", "Protected atomic swaps", "Implemented"], ["Risk", "Allowlists, caps, pause controls", "Implemented foundation"], ["Lending / bridge", "Future protocol modules", "Planned"]], [100,285,119]),
        "Production configuration, audits, external integrations and live liquidity remain separate gates from repository implementation.",
    ]),
    ("Architecture", "6. LQC Flow AMM", [
        "LQC Flow is the native constant-product AMM implementation in the repository. Its factory creates token pairs, each pair holds reserves and issues ERC-20 liquidity shares, and the router coordinates liquidity and swaps.",
        ("bullets", ["Constant-product reserve model with a 0.30% swap fee retained for LPs", "Minimum liquidity permanently locked", "Exact-input and exact-output swaps", "Direct and multi-hop paths", "Token/native-BNB liquidity and swap support", "Deadline and minimum-output protection"]),
        ("callout", "LQC Flow is testnet-oriented and unaudited. It must not be used with production funds before independent review and formal launch approval."),
    ]),
    ("Architecture", "7. Adapter and Registry Model", [
        "Each reviewed DEX integration uses a protocol-specific adapter. The registry records adapter identity, priority and active state. A failed quote is isolated so another enabled route may still be evaluated.",
        "Protocol-neutral architecture does not mean automatic compatibility. Every integration requires address review, path validation, automated tests and security review before activation.",
        ("table", [["Integration", "Implemented scope"], ["LQC Flow", "Native direct/multi-hop quote and execution"], ["PancakeSwap V2", "Compatible-router quote and protected exact-input execution"], ["PancakeSwap V3", "Packed paths, reviewed fee tiers/pools and maximum three hops"]], [150,354]),
    ]),
    ("Smart routing", "8. Quote and Route Discovery", [
        "The quote layer queries enabled adapters independently and excludes failed calls from comparison. Deterministic registry priority resolves ties and makes selection reproducible.",
        "Expected output is only one component of execution quality. The intended comparison considers pool fee, price impact, route gas, minimum output, deadline and route availability.",
        ("callout", "A quote is an estimate, not a guarantee. Realized output depends on state changes, inclusion timing, network conditions and user-selected protection."),
    ]),
    ("Smart routing", "9. Gas-Aware Selection", [
        "The gas-cost oracle converts estimated BNB gas into units of the output token. The router can therefore compare estimated net output rather than gross quote alone.",
        ("bullets", ["Primary and secondary feed checks", "Positive-value enforcement", "Freshness windows", "Maximum feed-deviation rule", "Governance-controlled configuration"]),
        "Production oracle addresses, heartbeat windows, deviation thresholds and fallback policy are not finalized. The current implementation uses test infrastructure and does not guarantee best execution.",
    ]),
    ("Smart routing", "10. Split Optimization", [
        "The optimizer samples allocations and may distribute one order across two to four eligible routes when the estimated net result is superior. Allocation and expected-output totals must reconcile exactly.",
        "The auto router converts the optimizer result into an atomic execution plan and derives route-level minimum outputs from the user's slippage tolerance.",
        ("bullets", ["One-to-four active route cap", "No duplicate DEX identifiers", "Deterministic allocation and tie behavior", "Inactive legs excluded", "Invalid part and route bounds rejected"]),
    ]),
    ("Execution", "11. Protected Atomic Execution", [
        "The execution router transfers the specified input, grants an exact temporary approval to the selected adapter and verifies recipient output. Deadline and minimum-output conditions apply to supported exact-input flows.",
        "For split execution, every leg is part of one transaction. If a later adapter fails, earlier transfers, pool changes and risk usage revert.",
        ("callout", "Repository tests require zero residual router/adapter custody after successful and reverted paths. This tested property is not a substitute for an independent audit."),
    ]),
    ("Execution", "12. Native BNB Handling", [
        "The native router wraps BNB into WBNB before protected token execution and unwraps WBNB for the final native-asset transfer. It is designed not to retain user balances.",
        ("bullets", ["Configured WBNB address", "Controlled receive path", "Minimum-output and deadline enforcement", "Exact approval lifecycle", "No unsolicited native transfer acceptance"]),
        "Each deployment must verify the canonical WBNB address and module linkage on the selected network.",
    ]),
    ("Risk management", "13. Risk Registry", [
        "The risk registry stages exposure through token allowlisting and input caps. Limits apply before adapter execution and rejected transactions must not consume daily capacity.",
        ("table", [["Control", "Purpose"], ["Token allowlist", "Restrict eligible input assets"], ["Per-transaction cap", "Bound single-order exposure"], ["Per-DEX/token cap", "Limit venue-specific exposure"], ["UTC-day cap", "Bound aggregate daily input"], ["Module pause", "Stop new protected execution"]], [150,354]),
    ]),
    ("Risk management", "14. Governance and Emergency Roles", [
        "Structural expansion is reserved for timelocked governance. Guardians may disable a DEX or pause new swaps immediately, but they cannot resume service, move user funds, add adapters or increase limits.",
        "A designated risk role may reduce existing limits but cannot create a new permission or expand exposure. Emergency-controller ownership uses nomination and explicit acceptance.",
        ("callout", "Production governance configuration is in development. Final multisig addresses, signer threshold, timelock delay and operating procedures require formal approval and verifiable disclosure."),
    ]),
    ("Security", "15. Token Compatibility Boundaries", [
        "The current execution design supports standard ERC-20 accounting assumptions. Fee-on-transfer inputs are explicitly rejected when the received balance differs from the requested input.",
        ("bullets", ["Fee-on-transfer execution: unsupported and rejected", "Rebasing token execution: unsupported", "Permit signatures: planned for later review", "Non-standard approval behavior: integration review required", "Token and pool allowlists: subject to production approval"]),
        "Unsupported behavior must not leave retained balances, approvals or risk-accounting residue.",
    ]),
    ("Testing", "16. Reproducible Engineering Baseline", [
        "At the publication baseline, the repository compiles 35 Solidity source files and reports 53 passing automated tests using locked dependencies. The exact Git commit and its CI run are authoritative when the suite evolves.",
        ("table", [["Area", "Representative evidence"], ["AMM", "Reserves, product, LP lock, liquidity and swap flows"], ["Router", "Quotes, adapters, gas, split and rollback"], ["Risk", "Allowlists, caps, model-based daily accounting"], ["Governance", "Timelock, pause-only guardian, ownership transfer"], ["Deployment", "Chain 97, bytecode, ownership and module links"]], [130,374]),
        ("callout", "Passing tests do not prove the absence of vulnerabilities or certify production economic safety."),
    ]),
    ("Deployment", "17. BSC Testnet Deployment", [
        "Deployment tooling targets BSC testnet chain ID 97. It deploys test tokens, LQC Flow and Router 2.0 modules, establishes ownership and registers the native adapter. Reviewed PancakeSwap endpoints may be supplied separately.",
        ("bullets", ["Read-only preflight checks chain ID, contract bytecode, reviewed endpoints and deployer tBNB balance", "Reject unexpected chain IDs before deployment", "Record deployed contracts and external dependencies", "Record compiler and optimizer settings", "Record governance and adapter configuration", "Never commit deployer private keys"]),
        "A generated deployment record is evidence only when its addresses and transactions are independently checked on the explorer.",
    ]),
    ("Deployment", "18. Address and Explorer Verification", [
        "The read-only validator checks deployed bytecode, Router-to-Factory and WBNB relationships, registry order, adapter status, module linkage, ownership and minimum timelock delay.",
        "The verification-package generator produces Solidity Standard JSON input, compiler settings, constructor arguments, deployed addresses and the recorded source revision for BscScan submission.",
        ("callout", "Explorer verification is the next deployment evidence gate. It becomes complete only after a real deployment record is validated and published against the exact reviewed commit."),
    ]),
    ("Future module", "19. Lending Design Direction", [
        "Lending is a future module and is not part of the current production claim. The design direction covers approved collateral deposits, borrowing, repayment, health-factor monitoring and controlled liquidation.",
        ("table", [["Parameter", "Current design disclosure"], ["Maximum LTV", "45% baseline"], ["Liquidation threshold", "60%"], ["Base liquidation penalty", "5%"], ["Automatic additional borrowing", "Off by default; explicit opt-in required"]], [190,314]),
        "Final values require economic simulation, oracle validation, liquidity testing, audit, legal review and formal governance approval.",
    ]),
    ("Future module", "20. Oracle and Liquidation Principles", [
        "Account risk should be determined by collateral value, debt and health factor rather than price movement alone. A shallow LQC pool must not be the sole lending oracle.",
        ("bullets", ["Validated external feeds", "Sufficiently liquid DEX TWAP where appropriate", "Freshness and deviation checks", "Debt and market-specific caps", "Partial liquidation where safe and economical", "Emergency pause and recovery procedures"]),
        "Production liquidation requires adversarial simulation, keeper design, bad-debt handling and clearly disclosed parameters.",
    ]),
    ("Future module", "21. Cross-Chain Direction", [
        "Cross-chain expansion is phased future scope. Non-EVM venues are not assumed compatible with EVM adapters and must use a separately reviewed messaging and accounting layer.",
        ("bullets", ["Authenticated messages", "Nonce consumption and replay protection", "Rate limits", "Emergency pause", "Canonical asset identification", "Global supply reconciliation"]),
        ("callout", "Cross-chain movement must not create unexplained LQC supply. Bridge design and audit are separate from Router 2.0 review."),
    ]),
    ("Token utility", "22. LQC Utility Boundaries", [
        "The approved design direction associates LQC with future loan-origination and repayment fee settlement and permanent burning of those fees. This does not mean the lending or burn contracts are currently live.",
        "Routing and AMM development does not by itself activate staking, governance, fee benefits, gas support, treasury distributions or other proposed utilities.",
        ("callout", "Utility activates only after contract completion, audit, parameters, legal review, formal approval and on-chain disclosure."),
    ]),
    ("Tokenomics", "23. Approved Tokenomics Overview", [
        "The current approved project design uses a fixed maximum supply of 1,000,000,000 LQC and planned TGE circulation of 150,000,000 LQC (15%). Earlier draft figures are superseded.",
        ("table", [["Allocation", "Share", "LQC"], ["Future ecosystem rewards", "35%", "350,000,000"], ["Community initial", "20%", "200,000,000"], ["Team and core contributors", "20%", "200,000,000"], ["Protocol treasury", "10%", "100,000,000"], ["Liquidity and market making", "10%", "100,000,000"], ["Grants and strategic ecosystem", "5%", "50,000,000"]], [260,80,164]),
    ]),
    ("Tokenomics", "24. TGE and Release Framework", [
        ("table", [["Allocation", "TGE / release framework"], ["Ecosystem rewards", "0 at TGE; 7+ years, up to 50M annually"], ["Community initial", "80M at TGE; remaining 120M activity-based over 24 months"], ["Team / contributors", "0 at TGE; 12-month cliff, then 36-month monthly vesting"], ["Protocol treasury", "10M at TGE; remaining 90M under 5-year budget framework"], ["Liquidity / MM", "50M at TGE; remaining 50M linked to exchange and pool growth"], ["Grants / strategic", "10M at TGE; remaining 40M milestone-based"]], [150,354]),
        "The planned 150M TGE circulation is Community 80M, Liquidity/MM 50M, Treasury 10M and Grants 10M. Contract and wallet evidence will be published after implementation and verification.",
    ]),
    ("Tokenomics", "25. Supply and Vesting Verification", [
        "Before launch, the token contract cap, total supply, decimals and mint/burn powers must reconcile to the approved disclosure. Every allocation wallet and vesting contract should be labeled and independently verifiable.",
        ("bullets", ["Canonical network and token address", "Deployment and ownership transactions", "Explorer-verified source and ABI", "Mint, pause, blacklist, upgrade and recovery powers", "Beneficiaries, cliffs and vesting schedules", "Circulating-supply methodology and excluded wallets"]),
        "No on-chain production token evidence is claimed in this edition.",
    ]),
    ("Economics", "26. Fees, Treasury and Burn", [
        "Potential revenue sources include routing and swap fees, future lending and repayment fees, liquidation fees, cross-chain services and Liquidity-as-a-Service arrangements. Actual revenue depends on deployed products and usage.",
        "Fee rates, settlement, conversion, burn addresses, treasury allocation and distributions are not final. A future burn must be verifiable on-chain and permanently remove the relevant LQC from circulation.",
        ("callout", "No yield, revenue, token-price appreciation or investment return is promised."),
    ]),
    ("Roadmap", "27. Development Status", [
        ("table", [["Workstream", "Current status"], ["LQC Flow AMM", "Implemented testnet MVP"], ["Router 2.0", "Implemented testnet MVP"], ["Pancake V2/V3 adapters", "Implemented; subject to production review"], ["Risk/governance foundation", "Implemented; production roles in development"], ["BSC testnet tooling", "Implemented; deployment evidence is next"], ["Lending, bridge, perpetuals", "Planned as separate scope"], ["Independent audit", "Required before production"]], [190,314]),
        "Repository implementation is not equivalent to production launch or commercial adoption.",
    ]),
    ("Roadmap", "28. Phased Delivery Plan", [
        ("table", [["Phase", "Gate"], ["Foundation", "AMM, Router, registry, access and test tooling"], ["Controlled testnet", "Addresses, verification, smoke tests and capped routes"], ["Independent review", "Audit, remediation, retest and known-issues disclosure"], ["Capped pilot", "Final multisig, oracle, monitoring, legal and liquidity approval"], ["Expansion", "Measured reliability, depth and incident-free operation"], ["Future modules", "Separate design, implementation, testing and audits"]], [125,379]),
        "Dates should not override security, legal, liquidity or operational readiness gates.",
    ]),
    ("Security", "29. Audit and Incident Readiness", [
        "An independent audit engagement must pin the exact commit, compiler, settings, contracts, addresses and configuration reviewed. Every Critical and High finding requires documented remediation and auditor retest or an explicit unresolved disposition.",
        ("bullets", ["Named incident responders and escalation contacts", "Alert coverage and pause procedure", "Compromised-key and signer-loss procedure", "Public vulnerability reporting policy", "Postmortem and recovery policy", "Periodic emergency drills"]),
        "The repository's audit scope and handoff documents are preparation materials, not an audit report.",
    ]),
    ("Due diligence", "30. CEX Listing Evidence", [
        ("table", [["Evidence group", "Required before submission"], ["Technical", "Pinned build, tests, audit, verified source and addresses"], ["Token", "Supply, decimals, powers, vesting and circulation proof"], ["Market", "Timestamped liquidity, holders, volume and methodology"], ["Operations", "Deposits, withdrawals, confirmations, monitoring and contacts"], ["Legal", "Entity, KYB/KYC, legal analysis, sanctions and AML controls"], ["Integrity", "Market-making policy and wash-trading prohibition"]], [135,369]),
        "Evidence not yet available must be completed, marked not applicable with accepted reasoning, or disclosed as an unresolved risk. No exchange approval is claimed.",
    ]),
    ("Legal", "31. Entity, Compliance and Disclaimer", [
        "The disclosed project entity is MMXlabs&LQC LLC, a Wyoming limited liability company. Formation, good standing, managers, beneficial ownership, authorized signatory, KYB and legal-opinion materials must be supplied through the reviewer's secure process.",
        "This document is technical and informational. It is not investment, legal, financial or tax advice; an offer or solicitation; or a guarantee of launch, listing, liquidity, revenue or return.",
        ("callout", "Digital assets and DeFi involve smart-contract, oracle, bridge, liquidity, market, operational, cybersecurity and regulatory risks."),
    ]),
    ("Conclusion", "32. Conclusion and Immediate Priorities", [
        "LQC has progressed from architecture into a testable EVM routing stack with a native AMM, external DEX adapters, gas-aware comparison, atomic split execution and staged risk controls.",
        ("table", [["Priority", "Next evidence milestone"], ["1", "Validate a controlled BSC testnet deployment and publish matching explorer source"], ["2", "Finalize multisig, roles, oracle parameters, allowlists and operational limits"], ["3", "Commission an independent audit; remediate and retest findings"], ["4", "Complete token, vesting, circulation, legal and CEX evidence packages"], ["5", "Run a monitored capped-liquidity pilot before any expansion"]], [60,444]),
        ("callout", "The next milestone is verified testnet and audit readiness - not unrestricted production deployment."),
    ]),
]

# Consolidated reviewer edition: closely related subjects share a page so the
# document remains dense without reducing type size or removing risk disclosures.
compact_pages = [
    pages[0],
    pages[1],
    pages[2],
    ("Design and architecture", "3. Principles and Modular Architecture", [
        ("table", [["Principle", "Engineering application"], ["Liquidity first", "Executable depth and measurable routing quality"], ["Modularity", "Separate quote, execution, risk and integration responsibilities"], ["Least privilege", "Divide governance, emergency and risk authority"], ["Evidence", "Pin code, settings, addresses and on-chain state"], ["Phased launch", "Testnet, caps and independent review before expansion"]], [135,369]),
        ("table", [["Layer", "Current status"], ["LQC Flow AMM", "Implemented testnet MVP"], ["Registry / quote / optimizer", "Implemented"], ["Execution / native BNB", "Implemented"], ["Risk and emergency controls", "Implemented foundation"], ["Lending / bridge / perpetuals", "Planned as separate scope"]], [235,269]),
        "Production configuration, audits, external integrations and live liquidity are separate gates from repository implementation.",
    ]),
    pages[5], pages[6],
    ("Smart routing", "6. Quote Discovery and Gas-Aware Selection", pages[7][2] + pages[8][2]),
    pages[9],
    ("Execution", "8. Protected Execution and Native BNB", pages[10][2] + pages[11][2]),
    ("Risk management", "9. Risk, Governance and Emergency Controls", pages[12][2] + pages[13][2]),
    pages[14],
    pages[15],
    pages[16],
    pages[17],
    ("Future module", "13. Lending, Oracle and Liquidation Direction", pages[18][2] + pages[19][2]),
    pages[20],
    ("Token utility", "15. Utility, Fees, Treasury and Burn", pages[21][2] + pages[25][2]),
    ("Tokenomics", "16. Tokenomics and Release Framework", pages[22][2] + pages[23][2]),
    pages[24],
    ("Roadmap", "18. Development Status and Delivery Plan", [
        ("table", [["Workstream", "Current status / next gate"], ["LQC Flow AMM", "Implemented testnet MVP"], ["Router 2.0 and adapters", "Implemented; production integration review required"], ["Risk / governance", "Implemented foundation; finalize production roles"], ["BSC testnet tooling", "Implemented; publish real deployment evidence"], ["Independent review", "Audit, remediation and retest required"], ["Future modules", "Separate design, implementation, testing and audits"]], [190,314]),
        ("table", [["Phase", "Gate"], ["Controlled testnet", "Addresses, verified source, smoke tests and capped routes"], ["Independent review", "Audit, remediation, retest and known-issues disclosure"], ["Capped pilot", "Multisig, oracle, monitoring, legal and liquidity approval"], ["Expansion", "Measured reliability, depth and incident-free operation"]], [135,369]),
    ]),
    pages[28],
    pages[29],
    ("Legal and conclusion", "20. Legal, Compliance and Immediate Priorities", [
        "The disclosed project entity is MMXlabs&LQC LLC, a Wyoming limited liability company. Formation, good standing, managers, beneficial ownership, authorized signatory, KYB and legal-opinion materials must be supplied through the reviewer's secure process.",
        "LQC has progressed from architecture into a testable EVM routing stack with a native AMM, external DEX adapters, gas-aware comparison, atomic split execution and staged risk controls.",
        ("table", [["Priority", "Next evidence milestone"], ["1", "Controlled BSC testnet deployment and explorer-verified source"], ["2", "Final multisig, roles, oracle, allowlists and operational limits"], ["3", "Independent audit, remediation and retest"], ["4", "Token, vesting, circulation, legal and CEX evidence packages"], ["5", "Monitored capped-liquidity pilot before expansion"]], [60,444]),
        "This document is technical and informational. It is not investment, legal, financial or tax advice; an offer or solicitation; or a guarantee of launch, listing, liquidity, revenue or return.",
        ("callout", "Digital assets and DeFi involve smart-contract, oracle, bridge, liquidity, market, operational, cybersecurity and regulatory risks."),
    ]),
]


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("LQC Whitepaper v5.0 - Review Edition")
    c.setAuthor("MMXlabs&LQC LLC")
    c.setSubject("Condensed official review edition for technical and exchange due diligence")

    # Cover
    c.setFillColor(NAVY); c.rect(0, 0, 612, 792, fill=1, stroke=0)
    c.setFillColor(MINT); c.setFont("LQCSans-Bold", 11); c.drawString(58, 730, "LQC  |  LIQUIDITY CHAIN")
    c.setFillColor(white); c.setFont("LQCSans-Bold", 32); c.drawString(58, 602, "LQC Whitepaper")
    c.setFont("LQCSans-Bold", 19); c.drawString(58, 560, "Official Review Edition")
    c.setFillColor(HexColor("#c8d7e1")); c.setFont("LQCSans", 12)
    c.drawString(58, 520, "Modular Global Liquidity Infrastructure")
    c.drawString(58, 498, "Connecting Fragmented Web3 Liquidity")
    c.setFillColor(MINT); c.roundRect(58, 394, 496, 66, 7, fill=1, stroke=0)
    c.setFillColor(NAVY); c.setFont("LQCSans-Bold", 11)
    c.drawString(76, 430, "Version 5.0  ·  September 2026  ·  25 pages")
    c.setFont("LQCSans", 9); c.drawString(76, 409, "Issued by MMXlabs&LQC LLC | Wyoming, United States")
    c.setFillColor(HexColor("#c8d7e1")); c.setFont("LQCSans", 8)
    c.drawString(58, 72, "Unaudited testnet MVP · No production or listing claim")
    c.showPage()

    # Contents
    y = draw_header(c, 2, "Review edition", "Contents and Status Legend")
    toc = [["Pages", "Section"], ["3-6", "Executive summary, problem, response and architecture"], ["7-11", "DEX adapters, routing, execution and risk"], ["12-16", "Compatibility, testing, deployment and future lending"], ["17-19", "Cross-chain, utility and tokenomics"], ["20-24", "Supply, roadmap, audit, CEX evidence and compliance"], ["25", "Conclusion and immediate priorities"]]
    draw_blocks(c, y, [("table", toc, [80,424]), ("callout", "Status legend: Implemented means public repository code/test evidence. In development means active implementation or configuration work. Subject to review means independent, legal, governance or deployment verification is required. Planned means no completed production module is claimed.")])
    draw_footer(c, 2); c.showPage()

    for section_number, (kicker, title, blocks) in enumerate(compact_pages, start=1):
        pdf_number = section_number + 2
        title = re.sub(r"^\d+\.", f"{section_number}.", title)
        y = draw_header(c, pdf_number, kicker, title)
        draw_blocks(c, y, blocks)
        draw_footer(c, pdf_number); c.showPage()

    c.save()
    reader = PdfReader(str(OUT))
    if len(reader.pages) != 25:
        raise RuntimeError(f"Expected 25 pages, created {len(reader.pages)}")


if __name__ == "__main__":
    build()
    print(OUT)
