// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCPythReferenceOracleWrapper} from "./LQCPythReferenceOracleWrapper.sol";

interface IBoundEngineRegistry {
    function registry() external view returns (address);
}

interface IVerifiedReferenceCacheUpdate {
    function update(bytes calldata signedUpdate) external payable;
}

/// @notice Returns verified prices only to the bound Engine invocation.
/// @dev Registry can independently validate the live cached quote for recovery.
contract LQCChainlinkPrimaryPythSession is LQCPythReferenceOracleWrapper {
    error MissingPythUpdate();
    error SessionInUse();
    error NoVerifiedSession();
    error CallbackUnavailable();

    bool public constant requiresSessionProof = true;
    address public immutable engine;
    address public immutable registry;
    uint256 public immutable marketId;

    constructor(
        address cache_, address chainlink_, address market_, address quote_, Policy memory policy,
        address engine_, address registry_, uint256 marketId_
    ) LQCPythReferenceOracleWrapper(cache_, chainlink_, market_, quote_, policy) {
        if (engine_.code.length == 0 || registry_.code.length == 0 || marketId_ == 0) revert InvalidConfiguration();
        if (IBoundEngineRegistry(engine_).registry() != registry_) revert InvalidConfiguration();
        engine = engine_;
        registry = registry_;
        marketId = marketId_;
    }

    // Retain the old selector with the arbitrary callback path disabled.
    function execute(bytes calldata, bytes calldata) external payable {
        revert CallbackUnavailable();
    }

    function verifyExecutionPrice(uint256 requestedMarket, address requestedToken, bytes calldata signedUpdate)
        external payable returns (uint256 price, uint256 updatedAt)
    {
        if (msg.sender != engine || requestedMarket != marketId || requestedToken != indexToken) {
            revert NoVerifiedSession();
        }
        if (signedUpdate.length == 0) revert MissingPythUpdate();
        IVerifiedReferenceCacheUpdate(address(cache)).update{value: msg.value}(signedUpdate);
        (, price, updatedAt) = _validatedPrices(requestedToken);
    }

    function getPrice(address requestedToken) external view override returns (uint256 price, uint256 updatedAt) {
        if (msg.sender != registry) revert NoVerifiedSession();
        (, price, updatedAt) = _validatedPrices(requestedToken);
    }
}
