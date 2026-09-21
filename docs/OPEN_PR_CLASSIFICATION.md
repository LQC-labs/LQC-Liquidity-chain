# LQC Open PR Classification

Snapshot purpose: prevent historical branches and old numbering from silently controlling current development.

This classification does **not** delete branch history. It determines whether an open PR is eligible for current work. A historical PR must be selectively revalidated against current `main` before any reuse.

## ACTIVE

No historical PR is currently authoritative for Master 7/3. Current `main` evidence controls the deployment-lineage reconciliation.

## REUSE — selective candidate, never merge wholesale without current-main review

| PR | Subject | Reuse timing / rule |
|---:|---|---|
| #253 | Router failure atomicity / zero residue | Security-hardening evidence candidate; Router Master 3 completion already exists, so do not reopen numbering |
| #211 | Canonical QuoteManager | Master 9 candidate; selective code/test reuse |
| #170 | Solver exposure/capacity gate | Master 9 candidate |
| #160 | Solver reputation feedback | Master 9 candidate |
| #63 | Intent + Solver architecture v1.1 broad branch | Master 8–10 source pool only; too broad/stale for wholesale merge |
| #56 | Fresh single-block DEX quote behavior | Selective UI/Router safety reference only if current regression shows a gap |
| #55 | Desktop buy/sell switch | UI reference candidate; not a current Core gate |
| #53 | Abort swap on wallet/network change | Selective UI safety reference if missing from current app |
| #31 | Discard stale asynchronous swap quotes | Selective UI safety reference if missing from current app |

## FUTURE

| PR | Subject | Rule |
|---:|---|---|
| #278 | LQC Launchpad development plan | Future workstream only. Launchpad must reuse the canonical Staking interface after 6/15–6/19 stabilizes; no second staking custody domain |
| #3 | Fixed-supply token issuance kit | Master 14 candidate only; contains historical configuration assumptions and must be rebuilt/revalidated against canonical 1B / 15% TGE tokenomics before use |

## SUPERSEDED / STALE — preserve history, do not merge into current main as-is

| PR | Subject | Reason |
|---:|---|---|
| #296 | Futures runtime V3 TWAP reference adapter | Selectively rebuilt and revalidated in Master 7/2; old diverged PR is superseded and should not be merged |
| #250 | Futures parallel reuse/gap inventory | Superseded as a status document by Master 7/1 current-main reconciliation; preserve only as history |
| #210 | Futures cross-source oracle deviation gate | Current on-chain Aggregator Oracle already has independent-reference deviation enforcement; old helper may remain review tooling but is not a Core merge candidate |
| #70 | Lending Stage 3 isolated supply vault | Superseded by canonical Lending Core supply/share accounting and 6/14 decision: no duplicate Earn vault |
| #64 | Alternate same-chain intent contract set | Superseded by current `intent-v1` / Master 8 architecture path; keep only as historical evidence |
| #54 | Stage 1→2 deployment handoff | Historical numbering/workflow superseded by current Master sequence and completion gates |
| #32 | Publish approved tokenomics + mixed website artifacts | Canonical tokenomics/whitepaper sources now control; branch is mixed historical material |
| #2 | Early Router/DEX dual-source oracle architecture | Superseded by Router 2.0, Oracle Foundation and current Master architecture |

## Merge rule

1. Current Master stage and `main` evidence control.
2. REUSE means cherry-pick/reimplement only the still-valid gap after fresh tests; it does not authorize merging the historical PR.
3. FUTURE stays untouched until its workstream opens.
4. SUPERSEDED / STALE stays as audit evidence unless later review proves a unique missing capability.
5. Before any old branch is reused, check current interfaces, tokenomics, deployment assumptions, tests and security boundaries.
