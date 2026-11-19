#!/usr/bin/env python3
"""Work 77 / Stage AZ: opt-in capture of one verified Pyth Pro signed fixture.

Unlike Stage AY, this deliberately saves the PUBLIC signed price update to a
local fixture for a separate, opt-in Solidity fork test. It NEVER saves or
prints the Pyth API key. No network without --capture-once. Never overwrites.
No broadcast, wallet, deployment, or automatic retry is performed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from probe_pyth_latest_stage_aw import Blocked, fetch_once, validate_candidate
from verify_pyth_onchain_stage_ay import (
    extract_signed_hex, verify_via_official_contract,
)


DEST = Path(__file__).resolve().parents[1] / "test-auth" / "fixtures" / "latest_verified_stage_az.json"
APPROVED_SIGNER = "0x26fb61a864c758ae9fba027a96010480658385b9"


def capture_once(token: str, now_us: int | None = None) -> dict:
    if not token or token.isspace() or any(c.isspace() for c in token):
        raise Blocked("Pyth API key missing or malformed; no network attempt")
    # This is a distinct, explicitly authorized API request for an exact fixture.
    response = fetch_once(token)
    # CRITICAL: sample the local clock *after* the HTTP response arrives.
    # Sampling before fetch incorrectly labels a newly published 200ms Pyth
    # update as "future" even when it is already in the past upon receipt.
    received_at_us = time.time_ns() // 1000 if now_us is None else now_us
    validate_candidate(response, received_at_us)
    signed_hex = extract_signed_hex(response)
    proof = verify_via_official_contract(signed_hex, response["parsed"])
    if (proof["cryptographicVerification"] != "PASS_OFFICIAL_PYTH_PRO_ETH_CALL_SIMULATION"
            or proof["signer"].lower() != APPROVED_SIGNER):
        raise Blocked("official signed update signer/status not approved for Stage S")
    return {
        "schema": "LQC-REC13.10.138-STAGE-AZ-v1",
        "signedUpdateHex": signed_hex,
        "timestampUs": proof["timestampUs"],
        "feedIds": proof["feedIds"],
        "signer": proof["signer"],
        "signedUpdateSha256": proof["signedUpdateSha256"],
        "verifiedPayloadSha256": proof["verifiedPayloadSha256"],
        "verification": proof["cryptographicVerification"],
        "transactionBroadcast": False,
    }


def write_fixture(destination: Path, doc: dict) -> None:
    """Exclusive 0600 create, never replace a historical signed fixture."""
    if not destination.parent.is_dir():
        raise Blocked("fixture parent directory missing")
    mode = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os, "O_NOFOLLOW"):
        mode |= os.O_NOFOLLOW
    payload = (json.dumps(doc, indent=2) + "\n").encode("ascii")
    try:
        fd = os.open(destination, mode, 0o600)
    except FileExistsError:
        raise Blocked("fixture already exists; will not overwrite") from None
    except OSError:
        raise Blocked("cannot create local fixture safely") from None
    with os.fdopen(fd, "wb") as f:
        f.write(payload)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--show-plan", action="store_true", help="No network, no file write")
    choice.add_argument("--capture-once", action="store_true", help="One Pyth request and read-only RPC check")
    args = parser.parse_args(argv)
    if args.show_plan:
        print("Stage AZ: one official Pyth fetch + eth_call, then exclusive local fixture save")
        print("Fixture location:", DEST)
        print("No private keys, no user wallet, no transaction/broadcast")
        return 0
    try:
        if DEST.exists():
            raise Blocked("fixture already exists; no network attempt")
        token = os.environ.get("PYTH_PRO_API_KEY", "")
        if not token or token.isspace() or any(c.isspace() for c in token):
            raise Blocked("PYTH_PRO_API_KEY absent or malformed; no network attempt")
        doc = capture_once(token)
        write_fixture(DEST, doc)
        print("PASS: official Pyth eth_call simulation; signed fixture saved locally")
        print("Fixture:", DEST)
        print("SHA256:", doc["signedUpdateSha256"])
        print("NOT_RUN: Stage AZ authenticated Foundry Solidity fork test")
        return 0
    except Blocked as exc:
        print("BLOCKED:", str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
