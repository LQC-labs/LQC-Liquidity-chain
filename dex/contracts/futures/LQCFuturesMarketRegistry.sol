// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Registry for LQC Flow perpetual/futures markets.
/// @dev Stores market configuration only. Position, margin and settlement logic live in separate contracts.
contract LQCFuturesMarketRegistry {
    struct Market {
        bytes32 symbol;
        address indexToken;
        address collateralToken;
        address oracle;
        uint32 maxLeverageBps;
        uint32 maintenanceMarginBps;
        bool active;
    }

    address public owner;
    address public pendingOwner;
    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(bytes32 => uint256) public marketIdBySymbol;

    event MarketAdded(uint256 indexed marketId, bytes32 indexed symbol, address indexToken, address collateralToken, address oracle);
    event MarketStatusChanged(uint256 indexed marketId, bool active);
    event MarketRiskUpdated(uint256 indexed marketId, uint32 maxLeverageBps, uint32 maintenanceMarginBps);
    event MarketOracleUpdated(uint256 indexed marketId, address indexed oracle);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error InvalidSymbol();
    error MarketExists();
    error MarketNotFound();
    error InvalidRiskParameters();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function addMarket(
        bytes32 symbol,
        address indexToken,
        address collateralToken,
        address oracle,
        uint32 maxLeverageBps,
        uint32 maintenanceMarginBps
    ) external onlyOwner returns (uint256 marketId) {
        if (symbol == bytes32(0)) revert InvalidSymbol();
        if (indexToken == address(0) || collateralToken == address(0) || oracle == address(0)) revert ZeroAddress();
        if (marketIdBySymbol[symbol] != 0) revert MarketExists();
        if (maxLeverageBps < 10_000 || maintenanceMarginBps == 0 || maintenanceMarginBps >= 10_000) {
            revert InvalidRiskParameters();
        }

        marketId = ++marketCount;
        markets[marketId] = Market({
            symbol: symbol,
            indexToken: indexToken,
            collateralToken: collateralToken,
            oracle: oracle,
            maxLeverageBps: maxLeverageBps,
            maintenanceMarginBps: maintenanceMarginBps,
            active: true
        });
        marketIdBySymbol[symbol] = marketId;
        emit MarketAdded(marketId, symbol, indexToken, collateralToken, oracle);
    }

    function setMarketActive(uint256 marketId, bool active) external onlyOwner {
        _requireMarket(marketId);
        markets[marketId].active = active;
        emit MarketStatusChanged(marketId, active);
    }

    function setRiskParameters(uint256 marketId, uint32 maxLeverageBps, uint32 maintenanceMarginBps) external onlyOwner {
        _requireMarket(marketId);
        if (maxLeverageBps < 10_000 || maintenanceMarginBps == 0 || maintenanceMarginBps >= 10_000) {
            revert InvalidRiskParameters();
        }
        Market storage market = markets[marketId];
        market.maxLeverageBps = maxLeverageBps;
        market.maintenanceMarginBps = maintenanceMarginBps;
        emit MarketRiskUpdated(marketId, maxLeverageBps, maintenanceMarginBps);
    }

    function setOracle(uint256 marketId, address oracle) external onlyOwner {
        _requireMarket(marketId);
        if (oracle == address(0)) revert ZeroAddress();
        markets[marketId].oracle = oracle;
        emit MarketOracleUpdated(marketId, oracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function _requireMarket(uint256 marketId) private view {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
    }
}
