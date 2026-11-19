#!/usr/bin/env python3
"""Read-only, one-shot Pyth Lazer diagnostic for Stage AW (NO BYPASS).

No network is performed unless --probe-once is explicitly passed. Never
prints, persists, forwards in a redirect, or otherwise discloses the API key.
An API response is ONLY an unsigned candidate until OFFICIAL BSC97 Pyth Pro
on-chain verification succeeds separately; this script cannot verify ECDSA.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


URL = "https://pyth-lazer.dourolabs.app/v1/latest_price"
# Pyth support explicitly recommended this identifier on 2026-11-18 after
# reproducing Cloudflare 1010 with Python-urllib/3.14. Do not impersonate a browser.
USER_AGENT = "LQC-Futures/1.0"
FEEDS = [1, 2]
PROPERTIES = ["price", "exponent", "feedUpdateTimestamp"]
MAX_RESPONSE = 1_048_576
MAX_AGE_US = 120_000_000


class Blocked(Exception):
    """An expected fail-closed diagnostic, with no secret values."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise Blocked("Redirect rejected; Authorization header not forwarded")


def request_body() -> dict:
    return {
        "channel": "fixed_rate@200ms",
        "formats": ["evm"],
        "properties": PROPERTIES,
        "priceFeedIds": FEEDS,
        "jsonBinaryEncoding": "hex",
        "parsed": True,
    }


def _strict_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Blocked(f"invalid {label}")
    if isinstance(value, str) and not re.fullmatch(r"-?[0-9]+", value):
        raise Blocked(f"invalid {label}")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise Blocked(f"invalid {label}") from None


def validate_candidate(payload: object, now_us: int) -> dict:
    """Structure + freshness checks ONLY; never a signature verification."""
    if not isinstance(payload, dict):
        raise Blocked("response is not a JSON object")
    parsed = payload.get("parsed")
    if not isinstance(parsed, dict):
        raise Blocked("signed parsed metadata missing")
    ts = _strict_int(parsed.get("timestampUs"), "timestampUs")
    if ts <= 0 or ts % 200_000 != 0:
        raise Blocked("timestamp is not aligned with fixed_rate@200ms")
    if ts > now_us or now_us - ts > MAX_AGE_US:
        raise Blocked("payload is stale or in the future")
    feeds = parsed.get("priceFeeds")
    if not isinstance(feeds, list) or len(feeds) != 2:
        raise Blocked("exactly two price feeds required")
    ids = []
    for feed in feeds:
        if not isinstance(feed, dict):
            raise Blocked("feed metadata must be an object")
        feed_id = _strict_int(feed.get("priceFeedId"), "feed ID")
        price = _strict_int(feed.get("price"), "price")
        exponent = _strict_int(feed.get("exponent"), "exponent")
        update = _strict_int(feed.get("feedUpdateTimestamp"), "feed timestamp")
        if price <= 0 or not -36 <= exponent <= 6:
            raise Blocked("invalid signed feed price or exponent")
        if update <= 0 or update > ts or now_us - update > MAX_AGE_US:
            raise Blocked("feed timestamp stale/future or later than payload")
        ids.append(feed_id)
    if ids != FEEDS:
        raise Blocked("unexpected feed IDs/order; expected 1,2")

    evm = payload.get("evm")
    if not isinstance(evm, dict) or evm.get("encoding") != "hex":
        raise Blocked("EVM-signed binary format missing")
    raw = evm.get("data")
    if not isinstance(raw, str):
        raise Blocked("EVM payload bytes missing")
    hex_text = raw[2:] if raw.startswith("0x") else raw
    if not 100 <= len(hex_text) <= 16384 or len(hex_text) % 2 or not re.fullmatch(
        r"[0-9a-fA-F]+", hex_text
    ):
        raise Blocked("invalid EVM payload hex shape")
    return {
        "feedIds": ids,
        "timestampUs": ts,
        "payloadByteCount": len(hex_text) // 2,
        "payloadSha256": hashlib.sha256(bytes.fromhex(hex_text)).hexdigest(),
        "cryptographicVerification": "NOT_PERFORMED__REQUIRES_OFFICIAL_PYTH_ONCHAIN",
    }


def fetch_once(token: str) -> dict:
    request = Request(
        URL, data=json.dumps(request_body(), separators=(",", ":")).encode(),
        method="POST",
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            body = response.read(MAX_RESPONSE + 1)
    except HTTPError as exc:
        # Print only the known status/signature-classification, NEVER headers
        # or raw response data, which could accidentally contain credentials.
        response_code = exc.code
        try:
            short_body = exc.read(200).decode("ascii", "ignore").lower()
        except Exception:
            short_body = ""
        if response_code == 403 and "1010" in short_body:
            raise Blocked("HTTP 403 / Cloudflare 1010 client-signature restriction") from None
        raise Blocked(f"HTTP {response_code} (provider refused request)") from None
    except URLError:
        raise Blocked("Pyth network connection failed") from None
    if len(body) > MAX_RESPONSE:
        raise Blocked("oversize provider response")
    try:
        return json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise Blocked("provider did not return valid JSON") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--show-request", action="store_true",
                        help="Print public JSON request only (no network)")
    inputs.add_argument("--from-json", type=Path,
                        help="Inspect a saved official response; no network")
    inputs.add_argument("--probe-once", action="store_true",
                        help="One authenticated API request; no retry or secret print")
    args = parser.parse_args(argv)
    if args.show_request:
        print(json.dumps({"url": URL, "method": "POST", "body": request_body()}, indent=2))
        return 0
    try:
        if args.from_json:
            try:
                response = json.loads(args.from_json.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                raise Blocked("response JSON cannot be read") from None
        else:
            token = os.environ.get("PYTH_PRO_API_KEY", "")
            if not token or token.isspace() or any(c.isspace() for c in token):
                raise Blocked("PYTH_PRO_API_KEY absent or malformed; no network attempt")
            response = fetch_once(token)
        result = validate_candidate(response, time.time_ns() // 1000)
        print(json.dumps(result, indent=2))
        print("BLOCKED: on-chain official Pyth Pro verification still required")
        return 0
    except Blocked as exc:
        print("BLOCKED:", str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
