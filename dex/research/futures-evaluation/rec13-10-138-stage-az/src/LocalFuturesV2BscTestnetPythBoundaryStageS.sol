// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPythProSignedUpdateVerifier, IVerifiedPythProPayloadReader} from
    "./LocalFuturesV2PythProBoundExitVerifier.sol";

/**
 * @notice REC-13.10.105: BSC-testnet-only REAL Pyth Pro research boundary.
 * @dev No custody, settlement, funding, trading or stateful oracle clock.
 *      In particular, THIS IS NOT PRODUCTION-READY OR AUDITED.
 *      Approved hash inputs must be sourced independently before real use.
 *      Proxy-code hash alone CANNOT detect proxy implementation upgrades.
 */
contract LocalFuturesV2BscTestnetPythBoundaryStageS {
    error WrongChain();
    error InvalidConfiguration();
    error UnapprovedBytecode();
    error WrongFee();
    error UntrustedSigner();
    error WrongChannel();
    error WrongFeed();
    error StaleOrFuturePrice();

    uint256 public constant BSC_TESTNET_CHAIN_ID = 97;
    address public constant OFFICIAL_PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;
    address public constant OBSERVED_SOURCE_SIGNER = 0x26FB61A864c758AE9fBA027a96010480658385B9;
    uint8 public constant FIXED_200MS_CHANNEL = 3;
    uint32 public constant BTC_USD = 1;
    uint32 public constant ETH_USD = 2;
    uint256 public constant MAX_AGE_US = 120 * 1e6;

    IVerifiedPythProPayloadReader public immutable reader;
    bytes32 public immutable approvedProxyCodehash;
    bytes32 public immutable approvedReaderCodehash;

    constructor(address reader_, bytes32 proxyHash_, bytes32 readerHash_) {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) revert WrongChain();
        if (reader_ == address(0) || reader_ == OFFICIAL_PYTH_PRO ||
            reader_.code.length == 0 || proxyHash_ == bytes32(0) ||
            readerHash_ == bytes32(0)) revert InvalidConfiguration();
        if (OFFICIAL_PYTH_PRO.codehash != proxyHash_ ||
            reader_.codehash != readerHash_) revert UnapprovedBytecode();

        reader = IVerifiedPythProPayloadReader(reader_);
        approvedProxyCodehash = proxyHash_;
        approvedReaderCodehash = readerHash_;
    }

    /** @dev Uses only the VERIFIED return payload, never raw signed input. */
    function verifySignedPrices(bytes calldata signedUpdate)
        external payable returns (IVerifiedPythProPayloadReader.Prices memory prices)
    {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) revert WrongChain();
        if (OFFICIAL_PYTH_PRO.codehash != approvedProxyCodehash ||
            address(reader).codehash != approvedReaderCodehash) revert UnapprovedBytecode();

        IPythProSignedUpdateVerifier verifier = IPythProSignedUpdateVerifier(OFFICIAL_PYTH_PRO);
        uint256 requiredFee = verifier.verification_fee();
        if (msg.value != requiredFee) revert WrongFee();
        (bytes memory verifiedPayload, address signer) =
            verifier.verifyUpdate{value: requiredFee}(signedUpdate);

        if (signer != OBSERVED_SOURCE_SIGNER) revert UntrustedSigner();
        if (verifiedPayload.length <= 12 ||
            uint8(verifiedPayload[12]) != FIXED_200MS_CHANNEL) revert WrongChannel();

        prices = reader.readVerifiedPrices(verifiedPayload, BTC_USD, ETH_USD);
        if (prices.marketFeedId != BTC_USD || prices.collateralFeedId != ETH_USD)
            revert WrongFeed();

        uint256 nowUs = block.timestamp * 1e6;
        _assertFresh(prices.payloadTimestampUs, nowUs);
        _assertFresh(prices.marketFeedTimestampUs, nowUs);
        _assertFresh(prices.collateralFeedTimestampUs, nowUs);
    }

    function _assertFresh(uint64 timestampUs, uint256 nowUs) private pure {
        if (timestampUs == 0 || uint256(timestampUs) > nowUs ||
            nowUs - uint256(timestampUs) > MAX_AGE_US) revert StaleOrFuturePrice();
    }
}
