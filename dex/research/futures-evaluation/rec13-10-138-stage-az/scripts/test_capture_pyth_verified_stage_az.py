#!/usr/bin/env python3
"""Work 77 Stage AZ capture tests: entirely offline, no authentic key or RPC."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import capture_pyth_verified_stage_az as az
from probe_pyth_latest_stage_aw import Blocked


PROOF = {
    "cryptographicVerification": "PASS_OFFICIAL_PYTH_PRO_ETH_CALL_SIMULATION",
    "signer": az.APPROVED_SIGNER,
    "timestampUs": 1795046429400000,
    "feedIds": [1, 2],
    "signedUpdateSha256": "1" * 64,
    "verifiedPayloadSha256": "2" * 64,
}
RESPONSE = {
    "evm": {"data": "0x" + "ab" * 139},
    "parsed": {"timestampUs": PROOF["timestampUs"]},
}


class StageAZTests(unittest.TestCase):
    def test_01_show_plan_never_calls_network(self):
        with patch.object(az, "fetch_once") as api:
            self.assertEqual(az.main(["--show-plan"]), 0)
        api.assert_not_called()

    def test_02_missing_key_refused_before_network(self):
        with patch.dict(os.environ, {"PYTH_PRO_API_KEY": ""}), \
             patch.object(az, "fetch_once") as api:
            with self.assertRaises(Blocked):
                az.capture_once("", 0)
        api.assert_not_called()

    def test_03_authenticated_candidate_yields_expected_fixture(self):
        with patch.object(az, "fetch_once", return_value=RESPONSE) as api, \
             patch.object(az, "validate_candidate"), \
             patch.object(az, "verify_via_official_contract", return_value=PROOF) as onchain:
            doc = az.capture_once("only-a-mock-key", 1795046429400100)
        api.assert_called_once()
        onchain.assert_called_once()
        self.assertEqual(doc["signedUpdateHex"], RESPONSE["evm"]["data"])
        self.assertEqual(doc["timestampUs"], PROOF["timestampUs"])
        self.assertNotIn("only-a-mock-key", json.dumps(doc))

    def test_04_signer_change_blocks_fixture(self):
        changed = {**PROOF, "signer": "0x" + "11" * 20}
        with patch.object(az, "fetch_once", return_value=RESPONSE), \
             patch.object(az, "validate_candidate"), \
             patch.object(az, "verify_via_official_contract", return_value=changed):
            with self.assertRaises(Blocked):
                az.capture_once("mock-token", 0)

    def test_05_unverified_status_blocks_fixture(self):
        changed = {**PROOF, "cryptographicVerification": "NOT_VERIFIED"}
        with patch.object(az, "fetch_once", return_value=RESPONSE), \
             patch.object(az, "validate_candidate"), \
             patch.object(az, "verify_via_official_contract", return_value=changed):
            with self.assertRaises(Blocked):
                az.capture_once("mock-token", 0)

    def test_06_write_fixture_exclusive_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "new.json"
            az.write_fixture(target, {"signedUpdateHex": "0xab"})
            self.assertEqual(json.loads(target.read_text())["signedUpdateHex"], "0xab")
            with self.assertRaises(Blocked):
                az.write_fixture(target, {"signedUpdateHex": "0xcd"})
            self.assertEqual(json.loads(target.read_text())["signedUpdateHex"], "0xab")
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_07_missing_parent_blocks_fixture(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(Blocked):
                az.write_fixture(Path(temporary) / "absent" / "new.json", {})

    def test_08_existing_fixture_blocks_before_api(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "previous.json"
            target.write_text("existing")
            with patch.object(az, "DEST", target), \
                 patch.dict(os.environ, {"PYTH_PRO_API_KEY": "mock-token"}), \
                 patch.object(az, "fetch_once") as api:
                self.assertEqual(az.main(["--capture-once"]), 2)
            api.assert_not_called()

    def test_09_clock_sampled_only_after_http_response(self):
        events = []

        def fetched(_token):
            events.append("response received")
            return RESPONSE

        def after_fetch_clock():
            events.append("clock sampled")
            return 1795046429400100000

        with patch.object(az, "fetch_once", side_effect=fetched), \
             patch.object(az.time, "time_ns", side_effect=after_fetch_clock), \
             patch.object(az, "validate_candidate") as check, \
             patch.object(az, "verify_via_official_contract", return_value=PROOF):
            az.capture_once("mock-token")
        self.assertEqual(events, ["response received", "clock sampled"])
        check.assert_called_once_with(RESPONSE, 1795046429400100)


if __name__ == "__main__":
    unittest.main()
