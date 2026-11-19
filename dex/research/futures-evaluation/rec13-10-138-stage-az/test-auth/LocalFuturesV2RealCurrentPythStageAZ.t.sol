// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LocalFuturesV2PythProBinaryPayloadReader as Reader} from
    "../src/LocalFuturesV2PythProBinaryPayloadReader.sol";
import {LocalFuturesV2BscTestnetPythBoundaryStageS as Boundary} from
    "../src/LocalFuturesV2BscTestnetPythBoundaryStageS.sol";
import {IVerifiedPythProPayloadReader} from
    "../src/LocalFuturesV2PythProBoundExitVerifier.sol";

interface VmAZ {
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonString(string calldata json, string calldata key)
        external pure returns (string memory);
    function parseJsonUint(string calldata json, string calldata key)
        external pure returns (uint256);
    function parseBytes(string calldata input) external pure returns (bytes memory);
    function warp(uint256 timestamp) external;
}

/**
 * @notice Work 77 / Stage AZ: REAL official Pyth verifier + REAL LQC Stage S
 *         and custom binary reader on a read-only BSC Testnet fork.
 * @dev No mock of Pyth at all. The opt-in fixture MUST be captured by the
 *      separate Stage AZ verified probe from the actual Pyth API. Missing
 *      fixture FAILS; no silently skipped or synthetic-proof fallback.
 *      The test deployments exist ONLY in the fork VM, not on BSC97.
 */
contract LocalFuturesV2RealCurrentPythStageAZTest {
    VmAZ private constant vm = VmAZ(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;
    string private constant FIXTURE = "test-auth/fixtures/latest_verified_stage_az.json";

    Boundary private boundary;
    uint256 private timestampUs;
    bytes private signedUpdate;

    function setUp() public {
        require(block.chainid == 97 && PYTH_PRO.code.length != 0, "read-only BSC97 fork required");
        // Missing or malformed fixture MUST revert, not convert to a mocked PASS.
        string memory json = vm.readFile(FIXTURE);
        signedUpdate = vm.parseBytes(vm.parseJsonString(json, ".signedUpdateHex"));
        timestampUs = vm.parseJsonUint(json, ".timestampUs");
        require(signedUpdate.length >= 100 && timestampUs > 0, "verified fixture required");
        Reader reader = new Reader();
        boundary = new Boundary(address(reader), PYTH_PRO.codehash, address(reader).codehash);
        vm.warp(timestampUs / 1e6 + 2);
    }

    function test01RealSignedPythPassesStageSAndActualBinaryReader() public {
        IVerifiedPythProPayloadReader.Prices memory p = boundary.verifySignedPrices(signedUpdate);
        require(p.marketFeedId == 1 && p.collateralFeedId == 2, "wrong feeds");
        require(p.payloadTimestampUs == timestampUs, "wrong signed timestamp");
        require(p.marketFeedTimestampUs > 0 && p.collateralFeedTimestampUs > 0, "missing feed timestamps");
        require(p.marketPrice18 > 0 && p.collateralPrice18 > 0, "zero verified price");
    }

    function test02TamperedRealSignedPythRejectedByOfficialVerifier() public {
        bytes memory corrupted = signedUpdate;
        corrupted[corrupted.length - 1] ^= bytes1(uint8(1));
        (bool success,) = address(boundary).call(
            abi.encodeWithSelector(Boundary.verifySignedPrices.selector, corrupted));
        require(!success, "tampered signed update must fail");
    }

    function _assertStageSRejectsForAge() private {
        (bool success, bytes memory reason) = address(boundary).call(
            abi.encodeWithSelector(Boundary.verifySignedPrices.selector, signedUpdate));
        require(!success && reason.length >= 4, "age guard did not revert");
        bytes4 selector;
        assembly ("memory-safe") { selector := mload(add(reason, 0x20)) }
        require(selector == Boundary.StaleOrFuturePrice.selector, "not Stage S age guard");
    }

    function test03RealSignedPythRejectedWhenStaleByStageS() public {
        vm.warp(timestampUs / 1e6 + 122);
        _assertStageSRejectsForAge();
    }

    function test04RealSignedPythRejectedWhenFutureByStageS() public {
        vm.warp(timestampUs / 1e6 - 1);
        _assertStageSRejectsForAge();
    }
}
