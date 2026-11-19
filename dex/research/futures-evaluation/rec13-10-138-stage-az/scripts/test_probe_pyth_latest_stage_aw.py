"""Offline safety regression tests for Stage AW Pyth API diagnostics."""

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError, URLError

import probe_pyth_latest_stage_aw as module


NOW = 1_794_908_600_000_000
ALIGNED = (NOW // 200_000) * 200_000


def example_response():
    return {
        "parsed": {
            "timestampUs": str(ALIGNED),
            "priceFeeds": [
                {"priceFeedId": 1, "price": "100000", "exponent": -2,
                 "feedUpdateTimestamp": str(ALIGNED)},
                {"priceFeedId": 2, "price": "20000", "exponent": -2,
                 "feedUpdateTimestamp": str(ALIGNED)},
            ],
        },
        "evm": {"encoding": "hex", "data": "2a22999a" + "ab" * 60},
    }


class StageAWPythProbeTest(unittest.TestCase):
    def test16_provider_approved_user_agent_sent_without_network(self):
        observed = {}

        class FakeOpener:
            def open(self, request, timeout):
                observed["agent"] = request.get_header("User-agent")
                observed["method"] = request.get_method()
                observed["body"] = json.loads(request.data)
                return io.BytesIO(b"{}")

        with mock.patch.object(module, "build_opener", return_value=FakeOpener()):
            self.assertEqual(module.fetch_once("DUMMY-NO-REAL-KEY"), {})
        self.assertEqual(observed["agent"], "LQC-Futures/1.0")
        self.assertEqual(observed["method"], "POST")
        self.assertEqual(observed["body"], module.request_body())

    def test01_shape_accepts_only_unverified_candidate(self):
        checked = module.validate_candidate(example_response(), NOW)
        self.assertEqual(checked["feedIds"], [1, 2])
        self.assertEqual(checked["payloadByteCount"], 64)
        self.assertIn("NOT_PERFORMED", checked["cryptographicVerification"])

    def test02_wrong_feed_order(self):
        sample = example_response()
        sample["parsed"]["priceFeeds"].reverse()
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test03_timestamp_stale(self):
        sample = example_response()
        sample["parsed"]["timestampUs"] = str(ALIGNED - 121_000_000)
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test04_timestamp_in_future(self):
        sample = example_response()
        sample["parsed"]["timestampUs"] = str(ALIGNED + 200_000)
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test05_unaligned_fixed_rate_timestamp(self):
        sample = example_response()
        sample["parsed"]["timestampUs"] = str(ALIGNED - 1)
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test06_missing_signed_evm_binary_is_blocked(self):
        sample = example_response()
        sample.pop("evm")
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test07_invalid_payload_hex_blocked(self):
        sample = example_response()
        sample["evm"]["data"] = "NOT_HEX"
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test08_feed_update_newer_than_payload_blocked(self):
        sample = example_response()
        sample["parsed"]["priceFeeds"][0]["feedUpdateTimestamp"] = str(ALIGNED + 1)
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test09_negative_price_blocked(self):
        sample = example_response()
        sample["parsed"]["priceFeeds"][0]["price"] = "-99"
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test10_non_integer_timestamp_blocked(self):
        sample = example_response()
        sample["parsed"]["timestampUs"] = "1.1"
        with self.assertRaises(module.Blocked):
            module.validate_candidate(sample, NOW)

    def test11_show_public_request_never_uses_credentials(self):
        with mock.patch.object(module, "fetch_once") as fetch:
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                self.assertEqual(module.main(["--show-request"]), 0)
        fetch.assert_not_called()
        data = json.loads(stdout.getvalue())
        self.assertEqual(data["body"]["priceFeedIds"], [1, 2])
        self.assertNotIn("Authorization", stdout.getvalue())

    def test12_missing_key_never_makes_network_request(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch.object(module, "fetch_once") as fetch:
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(module.main(["--probe-once"]), 2)
        fetch.assert_not_called()

    def test13_offline_json_cannot_turn_payload_into_authenticated_proof(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "response.json"
            path.write_text(json.dumps(example_response()), encoding="utf-8")
            with mock.patch.object(module.time, "time_ns", return_value=NOW * 1000):
                with mock.patch.object(module, "fetch_once") as fetch:
                    with contextlib.redirect_stdout(io.StringIO()) as stdout:
                        self.assertEqual(module.main(["--from-json", str(path)]), 0)
            fetch.assert_not_called()
            self.assertIn("on-chain official Pyth Pro", stdout.getvalue())

    def test14_http403_cloudflare1010_classifies_without_exposing_body(self):
        response = HTTPError(module.URL, 403, "Forbidden", {},
                             io.BytesIO(b"error code: 1010 SECRET-KEY-TEST"))
        class FakeOpener:
            def open(self, request, timeout):
                raise response
        with mock.patch.object(module, "build_opener", return_value=FakeOpener()):
            with self.assertRaises(module.Blocked) as caught:
                module.fetch_once("REDACTED-TEST-KEY")
        self.assertIn("Cloudflare 1010", str(caught.exception))
        self.assertNotIn("SECRET", str(caught.exception))

    def test15_network_error_has_no_key_or_full_url_dump(self):
        class FakeOpener:
            def open(self, request, timeout):
                raise URLError("token=PRIVATE-TEST-KEY")
        with mock.patch.object(module, "build_opener", return_value=FakeOpener()):
            with self.assertRaises(module.Blocked) as caught:
                module.fetch_once("PRIVATE-TEST-KEY")
        self.assertNotIn("PRIVATE-TEST-KEY", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
