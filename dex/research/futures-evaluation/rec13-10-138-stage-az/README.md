# REC-13.10.138 / Work 77 — Pyth Pro genuine signed Stage AZ (research only)

Status: **DRAFT / NOT_DEPLOYED / NOT_PRODUCTION_APPROVED**.

This is a deliberately small, reproducible extract of LQC Futures Work 77.
It contains only the Stage AZ genuine Pyth authentication boundary and the
required local dependencies, **not** the larger historical 107-file archive.
No `.github/workflows`, deployment scripts, transactions, signed payloads,
wallet keys, credentials, or executable CI workflow changes are included.

## Scope

- Official BSC Testnet (chain ID 97) Pyth Pro proxy:
  `0xACeA761c27A909d4D3895128EBe6370FDE2dF481`.
- The public Pyth API update is first checked through the deployed official
  verifier using read-only `eth_call` (`verifyUpdate(bytes)`); no transaction
  is broadcast. `PYTH_PRO_API_KEY` is used only in process memory.
- The authenticated bytes are read by the LQC binary reader and Stage S
  boundary in a **local Foundry fork**. Four tests cover: genuine verification,
  tampered update rejection, stale update rejection, and future update rejection.
- Only the five imported Solidity source dependencies and the API/capture
  Python modules plus offline unit tests are bundled.

## Reproduce (opt-in, separate from default tests)

Requirements: Python 3, Foundry `forge`/`cast`, a BSC97 read-only RPC,
and an authorized Pyth Pro API key for current signed BTC/USD and ETH/USD
feed IDs `1` and `2`. The network request is explicit and one-shot.

```bash
python3 -m unittest discover -s scripts -p 'test_*.py' -q
```

Only on a trusted local computer, capture a new ephemeral official fixture:

```bash
read -rsp 'Pyth API key (hidden): ' LQC_PYTH_KEY; printf '\n'
PYTH_PRO_API_KEY="$LQC_PYTH_KEY" python3 scripts/capture_pyth_verified_stage_az.py --capture-once
unset LQC_PYTH_KEY
```

Then run only the four opt-in genuine-authentication tests:

```bash
FOUNDRY_PROFILE=authenticated forge test --root . \
  --fork-url https://bsc-testnet-rpc.publicnode.com \
  --match-path 'test-auth/LocalFuturesV2RealCurrentPythStageAZ.t.sol' -vv
```

The fixture `test-auth/fixtures/latest_verified_stage_az.json` is intentionally
excluded by `.gitignore`. A missing, stale or invalid fixture **fails closed**.
Never commit an API key or a live authentication fixture. No automatic retries
or bypasses of a provider refusal are authorized.

## Evidence, with limitations

- Work 77 complete isolated package: **84/84 offline Python tests passed**.
- The user's WSL BSC97 read-only fork: **4/4 Stage AZ Solidity tests passed**
  using a fresh official signed Pyth payload (user screenshot of console output,
  2026-11-19 KST). This is **local evidence**, not this PR's GitHub CI result.
- This reduced review extract has its **own offline Python test result**;
  check the PR description for the exact count and reproducibility status.
- There is **no on-chain transaction receipt, external venue/custody E2E,
  independent production security audit, or deployment approval**.
- The official Pyth Pro proxy may change its implementation through
  governance without changing its proxy code hash; the current Stage S
  boundary does **not** independently pin the implementation slot.
  A release must handle authorized upgrades or fail closed on new versions.
- The custom signed binary reader requires independent security assessment
  against official maintained Pyth SDK semantics before production.

## Publication and governance

This directory is an isolated research proof, not an integration into the
existing DEX runtime or a recommendation to trade. No `main` merge, release,
token transfer, contract deployment or production authorization follows from
this Draft PR. Follow-up Work 78 must validate actual venue-to-settlement
integration, upgrade governance, CI and independent review separately.

Source files retain their SPDX headers. No third-party SDK source or provider
keys are redistributed here; official Pyth endpoints are invoked only with
the provider's own documented access requirements.
