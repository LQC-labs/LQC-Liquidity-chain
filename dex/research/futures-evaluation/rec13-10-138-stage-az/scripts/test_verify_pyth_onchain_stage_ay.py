#!/usr/bin/env python3
"""Offline-only, no credential/no RPC tests for Stage AY verifier probe."""

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from probe_pyth_latest_stage_aw import Blocked
import verify_pyth_onchain_stage_ay as ay


STAMP = 1_795_045_148_800_000
META = {
    "timestampUs": STAMP,
    "priceFeeds": [
        {"priceFeedId": 1, "price": 90000000000, "exponent": -8,
         "feedUpdateTimestamp": STAMP - 200_000},
        {"priceFeedId": 2, "price": 3000000000, "exponent": -8,
         "feedUpdateTimestamp": STAMP - 200_000},
    ],
}


def binary_payload() -> bytes:
    data = bytearray(ay.MAGIC.to_bytes(4, "big") + STAMP.to_bytes(8, "big") + b"\x00\x02")
    for feed in META["priceFeeds"]:
        data += feed["priceFeedId"].to_bytes(4, "big")
        data += b"\x03"
        data += b"\x00" + feed["price"].to_bytes(8, "big", signed=True)
        data += b"\x04" + feed["exponent"].to_bytes(2, "big", signed=True)
        data += b"\x0c\x01" + feed["feedUpdateTimestamp"].to_bytes(8, "big")
    assert len(data) == 68
    return bytes(data)


def abi_result(payload: bytes, signer: int = 1) -> str:
    n = len(payload)
    pad = (32 - n % 32) % 32
    return "0x" + (
        (64).to_bytes(32, "big") + signer.to_bytes(32, "big") +
        n.to_bytes(32, "big") + payload + b"\x00" * pad
    ).hex()


class StageAYOfflineTests(unittest.TestCase):
    def test_01_official_return_decodes(self):
        value, signer = ay.decode_verifier_return(abi_result(binary_payload()))
        self.assertEqual(value, binary_payload())
        self.assertEqual(signer, "0x" + "00" * 19 + "01")

    def test_02_reject_empty_return(self):
        with self.assertRaises(Blocked):
            ay.decode_verifier_return("0x")

    def test_03_reject_zero_signer(self):
        with self.assertRaises(Blocked):
            ay.decode_verifier_return(abi_result(binary_payload(), 0))

    def test_04_reject_bad_offset(self):
        raw = bytearray.fromhex(abi_result(binary_payload())[2:])
        raw[31] = 96
        with self.assertRaises(Blocked):
            ay.decode_verifier_return("0x" + raw.hex())

    def test_05_reject_noncanonical_padding(self):
        raw = bytearray.fromhex(abi_result(binary_payload())[2:])
        raw[-1] = 1
        with self.assertRaises(Blocked):
            ay.decode_verifier_return("0x" + raw.hex())

    def test_06_verified_binary_matches_api(self):
        result = ay.parse_verified_binary(binary_payload(), META)
        self.assertEqual(result["feedIds"], [1, 2])

    def test_07_reject_api_vs_verified_binary_mismatch(self):
        changed = {**META, "priceFeeds": [dict(x) for x in META["priceFeeds"]]}
        changed["priceFeeds"][0]["price"] += 1
        with self.assertRaises(Blocked):
            ay.parse_verified_binary(binary_payload(), changed)

    def test_08_reject_unknown_verified_property(self):
        raw = bytearray(binary_payload())
        raw[19] = 8
        with self.assertRaises(Blocked):
            ay.parse_verified_binary(bytes(raw), META)

    def test_09_chain_97_fee_zero_and_verify_success(self):
        with patch.object(ay, "safe_cast", side_effect=[
            "97", "0", abi_result(binary_payload())
        ]) as mocked:
            output = ay.verify_via_official_contract("0x1234", META)
        self.assertEqual(mocked.call_count, 3)
        self.assertEqual(output["cryptographicVerification"],
                         "PASS_OFFICIAL_PYTH_PRO_ETH_CALL_SIMULATION")
        self.assertFalse(output["transactionBroadcast"])

    def test_10_wrong_chain_never_calls_verifier(self):
        with patch.object(ay, "safe_cast", return_value="56") as mocked:
            with self.assertRaises(Blocked):
                ay.verify_via_official_contract("0x1234", META)
        self.assertEqual(mocked.call_count, 1)

    def test_11_nonzero_fee_never_calls_verifier(self):
        with patch.object(ay, "safe_cast", side_effect=["97", "1000"]) as mocked:
            with self.assertRaises(Blocked):
                ay.verify_via_official_contract("0x1234", META)
        self.assertEqual(mocked.call_count, 2)

    def test_12_child_process_environment_is_credential_free(self):
        class Result:
            returncode = 0
            stdout = "97\n"
        with patch.object(ay, "CAST", Path(__file__)), \
             patch.object(ay.subprocess, "run", return_value=Result()) as mocked, \
             patch.dict(os.environ, {"PYTH_PRO_API_KEY": "fake-SECRET", "LQC_PYTH_KEY": "fake-SECRET"}):
            self.assertEqual(ay.safe_cast(["chain-id"]), "97")
        child_env = mocked.call_args.kwargs["env"]
        self.assertNotIn("PYTH_PRO_API_KEY", child_env)
        self.assertNotIn("LQC_PYTH_KEY", child_env)

    def test_13_no_network_by_default(self):
        with patch.object(ay, "fetch_once") as mocked:
            self.assertEqual(ay.main(["--show-plan"]), 0)
        mocked.assert_not_called()

    def test_14_missing_key_blocks_before_network(self):
        with patch.dict(os.environ, {"PYTH_PRO_API_KEY": ""}), \
             patch.object(ay, "fetch_once") as mocked:
            self.assertEqual(ay.main(["--verify-once"]), 2)
        mocked.assert_not_called()


if __name__ == "__main__":
    unittest.main()
