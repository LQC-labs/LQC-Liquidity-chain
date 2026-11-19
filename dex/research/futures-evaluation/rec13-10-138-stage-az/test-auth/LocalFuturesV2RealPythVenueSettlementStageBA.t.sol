// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LocalFuturesV2PythProBinaryPayloadReader as Reader} from
    "../src/LocalFuturesV2PythProBinaryPayloadReader.sol";
import {LocalFuturesV2BscTestnetPythBoundaryStageS as Boundary} from
    "../src/LocalFuturesV2BscTestnetPythBoundaryStageS.sol";
import {LocalFuturesV2Bsc97PythAuthenticatedVenueStageAW as OracleVenue} from
    "../src/LocalFuturesV2Bsc97PythAuthenticatedVenueStageAW.sol";
import {LocalFuturesV2Bsc97ExactTokenVenueStageAV as Venue} from
    "../src/LocalFuturesV2Bsc97ExactTokenVenueStageAV.sol";
import {LocalFuturesV2Bsc97DualSignedSettlementStageAU as Settlement} from
    "../src/LocalFuturesV2Bsc97DualSignedSettlementStageAU.sol";
import {LocalFuturesV2Bsc97ExactERC20CustodyStageAT as Vault} from
    "../src/LocalFuturesV2Bsc97ExactERC20CustodyStageAT.sol";
import {
    ILQCVenueExecutionPortStageAR as VenuePort,
    ILQCCollateralCustodyPortStageAR as CustodyPort
} from "../src/LocalFuturesV2Bsc97PortsStageAR.sol";
import {IVerifiedPythProPayloadReader} from
    "../src/LocalFuturesV2PythProBoundExitVerifier.sol";

interface VmBA {
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonString(string calldata json, string calldata key)
        external pure returns (string memory);
    function parseJsonUint(string calldata json, string calldata key)
        external pure returns (uint256);
    function parseBytes(string calldata value) external pure returns (bytes memory);
    function warp(uint256 timestamp) external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest)
        external returns (uint8 v, bytes32 r, bytes32 s);
    function load(address account, bytes32 slot) external view returns (bytes32);
}

/** Test-only token with real balance and allowance changes inside the fork VM. */
contract StageBATestToken {
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external returns (bool)
    {
        require(allowance[from][msg.sender] >= amount, "no allowance");
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "no balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/**
 * @notice Work 78 / REC-13.10.139 / Stage BA: authentic Pyth-to-venue-to-
 *         two-issuer settlement integration, in a read-only BSC97 fork VM.
 * @dev The Pyth signature verifier is the REAL deployed official contract.
 *      Stage AV token balances/custody are LOCAL SYNTHETIC tokens, and the
 *      maker/venue/custody signers are LOCAL TEST KEYS. This is NOT a real
 *      external venue, custodian, chain transaction or economic approval.
 *      The fresh Work 77 signed fixture must exist locally. No fake oracle,
 *      fake signed update, live token, wallet or broadcast is accepted.
 */
contract LocalFuturesV2RealPythVenueSettlementStageBATest {
    VmBA private constant vm =
        VmBA(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant PYTH_PRO =
        0xACeA761c27A909d4D3895128EBe6370FDE2dF481;
    address private constant OBSERVED_IMPLEMENTATION =
        0xA089a10d05CE37f4B99Dc4F1824ba253434A779E;
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC;
    string private constant FIXTURE =
        "test-auth/fixtures/latest_verified_stage_az.json";

    bytes32 private constant TRADE = keccak256("REC139_BA_TRADE");
    bytes32 private constant POSITION = keccak256("REC139_BA_POSITION");
    uint256 private constant MAKER_KEY = 0x139A;
    uint256 private constant VENUE_ISSUER_KEY = 0x139B;
    uint256 private constant CUSTODY_ISSUER_KEY = 0x139C;

    bytes private signedUpdate;
    uint256 private timestampUs;
    uint256 private oraclePrice18;
    StageBATestToken private quote;
    StageBATestToken private base;
    Venue private venue;
    OracleVenue private oracleVenue;
    Settlement private settlement;
    Vault private vault;

    function setUp() public {
        require(block.chainid == 97 && PYTH_PRO.code.length != 0,
            "read-only BSC97 fork required");

        // This independently observed implementation pin is test-only. An
        // upgrade MUST trigger review, not silently pass proxy-codehash checks.
        address implementation = address(uint160(uint256(
            vm.load(PYTH_PRO, IMPLEMENTATION_SLOT))));
        require(implementation == OBSERVED_IMPLEMENTATION &&
            implementation.code.length != 0, "unreviewed Pyth implementation");

        string memory json = vm.readFile(FIXTURE);
        signedUpdate = vm.parseBytes(vm.parseJsonString(json, ".signedUpdateHex"));
        timestampUs = vm.parseJsonUint(json, ".timestampUs");
        require(timestampUs > 0 && signedUpdate.length >= 100,
            "real signed fixture required");
        vm.warp(timestampUs / 1e6 + 2);

        Reader reader = new Reader();
        Boundary boundary = new Boundary(
            address(reader), PYTH_PRO.codehash, address(reader).codehash);
        IVerifiedPythProPayloadReader.Prices memory p =
            boundary.verifySignedPrices(signedUpdate);
        require(p.marketFeedId == 1 && p.collateralFeedId == 2 &&
            p.payloadTimestampUs == timestampUs && p.marketPrice18 > 0 &&
            p.marketPrice18 <= 1e30, "unexpected genuine Pyth prices");
        oraclePrice18 = p.marketPrice18;

        quote = new StageBATestToken();
        base = new StageBATestToken();
        quote.mint(address(this), oraclePrice18 * 3 + 300e18);
        base.mint(address(this), 2e18);

        venue = new Venue(
            address(quote), address(quote).codehash,
            address(base), address(base).codehash,
            vm.addr(MAKER_KEY), 200);
        quote.approve(address(venue), type(uint256).max);
        base.approve(address(venue), type(uint256).max);
        venue.fundBaseInventory(2e18);

        oracleVenue = new OracleVenue(
            address(venue), address(venue).codehash,
            address(boundary), address(boundary).codehash,
            address(quote), address(base), 500, 120, 30);
        settlement = new Settlement(
            address(oracleVenue), address(oracleVenue).codehash,
            vm.addr(VENUE_ISSUER_KEY), vm.addr(CUSTODY_ISSUER_KEY),
            200, 120);
        vault = new Vault(
            address(quote), address(quote).codehash, address(settlement));
        settlement.bindVault(address(vault), address(vault).codehash);
        settlement.registerOwnPosition(POSITION);
        quote.approve(address(vault), type(uint256).max);
        vault.depositOwn(POSITION, 100e18);
    }

    function _fill(uint256 paidQuote18) private view returns (Venue.Fill memory f) {
        f = Venue.Fill({
            tradeId: TRADE, positionKey: POSITION, account: address(this),
            quoteSpent18: paidQuote18, baseReceived18: 1e18,
            feePaid18: 0, minBaseReceived18: 1e18,
            nonce: 139, deadline: block.timestamp + 180
        });
    }

    function _executeTestTokenFill(uint256 paidQuote18) private {
        Venue.Fill memory f = _fill(paidQuote18);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MAKER_KEY, venue.previewFill(f));
        venue.executeSignedFill(f, abi.encodePacked(r, s, v));
    }

    function _witness(bytes memory proof) private returns (bytes32) {
        return oracleVenue.witnessSignedExecution(
            TRADE, POSITION, keccak256(abi.encode(venue.executionOf(TRADE))), proof);
    }

    function _claim(bytes32 receiptHash)
        private view returns (Settlement.Claim memory c)
    {
        c = Settlement.Claim({
            tradeId: TRADE, positionKey: POSITION, executionDigest: receiptHash,
            owner: address(this), principal18: 100e18, payout18: 100e18,
            nonce: 139, deadline: block.timestamp + 180
        });
    }

    function _sig(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _selector(bytes memory reason) private pure returns (bytes4 s) {
        require(reason.length >= 4, "missing revert selector");
        assembly ("memory-safe") { s := mload(add(reason, 32)) }
    }

    function _noWitness() private view returns (bool) {
        OracleVenue.Witness memory w = oracleVenue.witnessOf(TRADE);
        return w.boundEvidence == bytes32(0);
    }

    function _notSettled() private view returns (bool) {
        CustodyPort.CustodyReceipt memory c = vault.custodyOf(POSITION);
        return !c.finalized;
    }

    function test01RealSignedPythWitnessSettlesTestTokensAcrossAWAUAT() public {
        _executeTestTokenFill(oraclePrice18);
        bytes32 evidence = _witness(signedUpdate);
        VenuePort.ExecutionReceipt memory e = oracleVenue.executionOf(TRADE);
        VenuePort.ExecutionReceipt memory original = venue.executionOf(TRADE);
        require(e.finalized && e.executionEvidence == evidence &&
            evidence != original.executionEvidence,
            "no independent oracle-bound venue evidence");

        Settlement.Claim memory c = _claim(keccak256(abi.encode(e)));
        (bytes32 venueDigest, bytes32 custodyDigest) = settlement.preview(c);
        settlement.settleWithApprovals(c,
            _sig(VENUE_ISSUER_KEY, venueDigest),
            _sig(CUSTODY_ISSUER_KEY, custodyDigest));

        CustodyPort.CustodyReceipt memory receipt = vault.custodyOf(POSITION);
        require(receipt.finalized && receipt.payout18 == 100e18 &&
            settlement.usedTrade(TRADE) && settlement.usedNonce(139) &&
            quote.balanceOf(address(venue)) == oraclePrice18 &&
            base.balanceOf(address(this)) == 1e18,
            "signed-Pyth local venue/settlement flow incomplete");
    }

    function test02TamperedSignedUpdateCannotCreateVenueWitness() public {
        _executeTestTokenFill(oraclePrice18);
        bytes memory corrupted = signedUpdate;
        corrupted[corrupted.length - 1] ^= bytes1(uint8(1));
        (bool ok,) = address(oracleVenue).call(abi.encodeCall(
            OracleVenue.witnessSignedExecution,
            (TRADE, POSITION,
             keccak256(abi.encode(venue.executionOf(TRADE))), corrupted)));
        require(!ok && _noWitness() &&
            !settlement.usedTrade(TRADE),
            "tampered official signed update authorized a local settlement");
    }

    function test03UnwitnessedTradeCannotReachDualSignedSettlement() public {
        _executeTestTokenFill(oraclePrice18);
        Settlement.Claim memory c = _claim(
            keccak256(abi.encode(venue.executionOf(TRADE))));
        (bool ok, bytes memory reason) = address(settlement).staticcall(
            abi.encodeCall(Settlement.preview, (c)));
        require(!ok && _selector(reason) ==
            OracleVenue.NoAuthenticatedWitness.selector &&
            _notSettled(),
            "unwitnessed venue receipt reached settlement");
    }

    function test04ExpiredPythWitnessCannotReachSettlement() public {
        _executeTestTokenFill(oraclePrice18);
        _witness(signedUpdate);
        vm.warp(block.timestamp + 121);
        Settlement.Claim memory c = _claim(
            keccak256(abi.encode(venue.executionOf(TRADE))));
        (bool ok, bytes memory reason) = address(settlement).staticcall(
            abi.encodeCall(Settlement.preview, (c)));
        require(!ok && _selector(reason) == OracleVenue.StaleOracle.selector &&
            !settlement.usedTrade(TRADE),
            "expired signed Pyth observation authorized settlement");
    }

    function test05RealPythPriceDeviationRejectsTestTokenFillEvidence() public {
        _executeTestTokenFill(oraclePrice18 * 2);
        (bool ok, bytes memory reason) = address(oracleVenue).call(
            abi.encodeCall(OracleVenue.witnessSignedExecution,
                (TRADE, POSITION,
                 keccak256(abi.encode(venue.executionOf(TRADE))), signedUpdate)));
        require(!ok && _selector(reason) == OracleVenue.PriceDeviation.selector &&
            _noWitness(),
            "large trade-vs-real-Pyth deviation accepted");
    }

    function test06WrongCustodyIssuerCannotSettleRealPythWitness() public {
        _executeTestTokenFill(oraclePrice18);
        _witness(signedUpdate);
        Settlement.Claim memory c = _claim(
            keccak256(abi.encode(oracleVenue.executionOf(TRADE))));
        (bytes32 venueDigest, bytes32 custodyDigest) = settlement.preview(c);
        (bool ok, bytes memory reason) = address(settlement).call(
            abi.encodeCall(Settlement.settleWithApprovals,
                (c, _sig(VENUE_ISSUER_KEY, venueDigest),
                 _sig(VENUE_ISSUER_KEY, custodyDigest))));
        require(!ok && _selector(reason) == Settlement.WrongCustodySigner.selector &&
            !settlement.usedTrade(TRADE) && _notSettled(),
            "forged second issuer authorized Pyth-bound settlement");
    }
}
