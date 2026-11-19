#!/usr/bin/env python3
"""Stage AY: one-shot, read-only Pyth Pro BSC97 verifyUpdate eth_call.

This is an eth_call simulation against the official deployed verifier, NOT an
on-chain transaction or a recorded receipt. It never prints or persists the
API key or signed update. It cannot authorize production deployment.

Default mode performs NO network requests. --verify-once explicitly performs
one Pyth REST request and bounded, read-only Cast RPC calls. No wallet, no
private key, no broadcast, no retry loop, no files written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from probe_pyth_latest_stage_aw import (
    Blocked, FEEDS, fetch_once, validate_candidate,
)
import time


OFFICIAL_BSC97_PYTH_PRO = "0xACeA761c27A909d4D3895128EBe6370FDE2dF481"
BSC97_RPC = "https://bsc-testnet-rpc.publicnode.com"
CAST = Path.home() / ".foundry" / "bin" / "cast"
MAGIC = 2479346549
PROPERTY_PRICE = 0
PROPERTY_EXPONENT = 4
PROPERTY_UPDATE_TIME = 12


def extract_signed_hex(response: dict) -> str:
    """Run validate_candidate first; this only normalizes that validated input."""
    signed = response["evm"]["data"]
    return "0x" + (signed[2:] if signed.startswith("0x") else signed).lower()


def parse_verified_binary(payload: bytes, parsed: dict) -> dict:
    """Decode the narrow 2-feed/3-property canonical Pyth payload strictly.

    The bytes here are ONLY supplied from the successful official verifyUpdate
    return; unverified API `parsed` data is used solely for an exact crosscheck.
    """
    if len(payload) != 68 or int.from_bytes(payload[:4], "big") != MAGIC:
        raise Blocked("officially returned payload has unexpected binary layout")
    timestamp_us = int.from_bytes(payload[4:12], "big")
    if payload[13] != 2 or timestamp_us != int(parsed["timestampUs"]):
        raise Blocked("verified binary header differs from API metadata")
    cursor = 14
    feeds = []
    for expected in parsed["priceFeeds"]:
        feed_id = int.from_bytes(payload[cursor:cursor + 4], "big")
        count = payload[cursor + 4]
        cursor += 5
        if count != 3:
            raise Blocked("verified binary requires three properties per feed")
        properties = {}
        for _ in range(3):
            pid = payload[cursor]
            cursor += 1
            if pid in properties:
                raise Blocked("duplicate verified binary property")
            if pid == PROPERTY_PRICE:
                properties[pid] = int.from_bytes(payload[cursor:cursor + 8], "big", signed=True)
                cursor += 8
            elif pid == PROPERTY_EXPONENT:
                properties[pid] = int.from_bytes(payload[cursor:cursor + 2], "big", signed=True)
                cursor += 2
            elif pid == PROPERTY_UPDATE_TIME:
                if payload[cursor] != 1:
                    raise Blocked("invalid verified feed timestamp option")
                cursor += 1
                properties[pid] = int.from_bytes(payload[cursor:cursor + 8], "big")
                cursor += 8
            else:
                raise Blocked("unexpected verified binary property ID")
        if set(properties) != {PROPERTY_PRICE, PROPERTY_EXPONENT, PROPERTY_UPDATE_TIME}:
            raise Blocked("missing verified binary property")
        if (feed_id != int(expected["priceFeedId"]) or
            properties[PROPERTY_PRICE] != int(expected["price"]) or
            properties[PROPERTY_EXPONENT] != int(expected["exponent"]) or
            properties[PROPERTY_UPDATE_TIME] != int(expected["feedUpdateTimestamp"])):
            raise Blocked("verified binary feed differs from API metadata")
        feeds.append(feed_id)
    if cursor != len(payload) or feeds != FEEDS:
        raise Blocked("verified binary has wrong feed order or trailing bytes")
    return {"feedIds": feeds, "timestampUs": timestamp_us}


def decode_verifier_return(output: str) -> tuple[bytes, str]:
    """Strictly decode canonical Solidity (bytes payload, address signer)."""
    if not isinstance(output, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", output):
        raise Blocked("official verifyUpdate returned no ABI data")
    raw = bytes.fromhex(output[2:])
    if not 96 <= len(raw) <= 2048 or len(raw) % 32:
        raise Blocked("malformed official verifyUpdate return length")
    if int.from_bytes(raw[:32], "big") != 64 or any(raw[32:44]):
        raise Blocked("malformed official verifyUpdate return head")
    signer = "0x" + raw[44:64].hex()
    if signer == "0x" + "00" * 20:
        raise Blocked("official verifier returned a zero signer")
    n = int.from_bytes(raw[64:96], "big")
    if n == 0 or n > 1024 or len(raw) != 96 + ((n + 31) // 32) * 32:
        raise Blocked("malformed official verifyUpdate dynamic payload")
    if any(raw[96 + n:]):
        raise Blocked("noncanonical official verifyUpdate padding")
    return raw[96:96 + n], signer


def safe_cast(args: list[str]) -> str:
    if not CAST.is_file():
        raise Blocked("Foundry cast is unavailable at ~/.foundry/bin/cast")
    # Never pass any Pyth bearer token to a child process or public RPC.
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(Path.home()),
        "LANG": "C.UTF-8",
    }
    try:
        completed = subprocess.run(
            [str(CAST), *args], capture_output=True, text=True,
            timeout=25, env=env, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise Blocked("read-only Foundry RPC call unavailable or timed out") from None
    # Never echo stderr, which can contain request bytes in verbose RPC errors.
    if completed.returncode != 0:
        raise Blocked("read-only Foundry RPC call failed or reverted")
    if len(completed.stdout) > 8192:
        raise Blocked("oversize Foundry RPC output")
    return completed.stdout.strip()


def verify_via_official_contract(signed_hex: str, parsed: dict) -> dict:
    """Chain gate, current fee gate, then one on-chain verifier simulation."""
    chain_id = safe_cast(["chain-id", "--rpc-url", BSC97_RPC])
    if chain_id != "97":
        raise Blocked("wrong chain ID; BSC Testnet 97 required")
    fee_text = safe_cast([
        "call", OFFICIAL_BSC97_PYTH_PRO, "verification_fee()(uint256)",
        "--rpc-url", BSC97_RPC,
    ])
    if fee_text != "0":
        raise Blocked("nonzero or unknown verifier fee; stop before eth_call")
    output = safe_cast([
        "call", OFFICIAL_BSC97_PYTH_PRO, "verifyUpdate(bytes)", signed_hex,
        "--rpc-url", BSC97_RPC,
    ])
    payload, signer = decode_verifier_return(output)
    verified = parse_verified_binary(payload, parsed)
    return {
        "chainId": 97,
        "officialPythPro": OFFICIAL_BSC97_PYTH_PRO,
        "verificationFeeWei": 0,
        "feedIds": verified["feedIds"],
        "timestampUs": verified["timestampUs"],
        "signer": signer,
        "signedUpdateSha256": hashlib.sha256(bytes.fromhex(signed_hex[2:])).hexdigest(),
        "verifiedPayloadSha256": hashlib.sha256(payload).hexdigest(),
        "cryptographicVerification": "PASS_OFFICIAL_PYTH_PRO_ETH_CALL_SIMULATION",
        "transactionBroadcast": False,
        "productionApproval": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--show-plan", action="store_true", help="No network")
    choice.add_argument("--verify-once", action="store_true", help="One Pyth fetch, bounded eth_call checks")
    args = parser.parse_args(argv)
    if args.show_plan:
        print(json.dumps({
            "api": "Pyth latest_price once",
            "rpc": BSC97_RPC,
            "chainId": 97,
            "contract": OFFICIAL_BSC97_PYTH_PRO,
            "operations": ["eth_chainId", "verification_fee()", "eth_call verifyUpdate(bytes)"],
            "walletOrTransaction": False,
        }, indent=2))
        return 0
    try:
        token = os.environ.get("PYTH_PRO_API_KEY", "")
        if not token or token.isspace() or any(c.isspace() for c in token):
            raise Blocked("PYTH_PRO_API_KEY absent or malformed; no network attempt")
        response = fetch_once(token)
        validate_candidate(response, time.time_ns() // 1000)
        signed_hex = extract_signed_hex(response)
        result = verify_via_official_contract(signed_hex, response["parsed"])
        print(json.dumps(result, indent=2))
        print("PASS: official BSC97 verifier eth_call simulation (NOT a transaction receipt)")
        return 0
    except (Blocked, KeyError, IndexError, TypeError, ValueError) as exc:
        reason = str(exc) if isinstance(exc, Blocked) else "invalid verifier result structure"
        print("BLOCKED:", reason, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
