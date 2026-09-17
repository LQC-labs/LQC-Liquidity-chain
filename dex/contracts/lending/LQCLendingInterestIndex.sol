// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCInterestRateModel {
    function rates(bytes32 id, uint256 totalBorrow, uint256 totalLiquidity)
        external view returns (uint256 borrowRatePerSecondRay, uint256 supplyRatePerSecondRay, uint256 utilizationRay);
}

/// @notice Linear per-market Borrow and Supply indexes updated only by an approved Lending core.
contract LQCLendingInterestIndex {
    uint256 public constant RAY = 1e27;

    struct IndexState {
        uint128 borrowIndexRay;
        uint128 supplyIndexRay;
        uint64 lastAccrued;
    }

    address public owner;
    address public pendingOwner;
    address public core;
    ILQCInterestRateModel public immutable rateModel;
    mapping(bytes32 marketId => IndexState) public indexStates;

    event CoreUpdated(address indexed previousCore, address indexed newCore);
    event MarketInitialized(bytes32 indexed marketId, uint256 timestamp);
    event InterestAccrued(
        bytes32 indexed marketId,
        uint256 elapsed,
        uint256 borrowIndexRay,
        uint256 supplyIndexRay,
        uint256 utilizationRay
    );
    event SupplyLossApplied(bytes32 indexed marketId, uint256 loss, uint256 supplyIndexRay);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error AlreadyInitialized();
    error NotInitialized();
    error IndexOverflow();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address rateModel_) {
        if (owner_ == address(0) || rateModel_ == address(0)) revert ZeroAddress();
        owner = owner_;
        rateModel = ILQCInterestRateModel(rateModel_);
        emit OwnershipTransferred(address(0), owner_);
    }

    function initializeMarket(bytes32 id) external onlyOwner {
        if (id == bytes32(0)) revert NotInitialized();
        if (indexStates[id].lastAccrued != 0) revert AlreadyInitialized();
        indexStates[id] = IndexState(uint128(RAY), uint128(RAY), uint64(block.timestamp));
        emit MarketInitialized(id, block.timestamp);
    }

    function accrue(bytes32 id, uint256 totalBorrow, uint256 totalLiquidity)
        external returns (uint256 borrowIndexRay, uint256 supplyIndexRay)
    {
        if (msg.sender != core) revert Unauthorized();
        IndexState storage state = indexStates[id];
        if (state.lastAccrued == 0) revert NotInitialized();
        uint256 elapsed = block.timestamp - state.lastAccrued;
        borrowIndexRay = state.borrowIndexRay;
        supplyIndexRay = state.supplyIndexRay;
        if (elapsed == 0) return (borrowIndexRay, supplyIndexRay);
        (uint256 borrowRate, uint256 supplyRate, uint256 utilization) =
            rateModel.rates(id, totalBorrow, totalLiquidity);
        borrowIndexRay += borrowIndexRay * borrowRate * elapsed / RAY;
        supplyIndexRay += supplyIndexRay * supplyRate * elapsed / RAY;
        if (borrowIndexRay > type(uint128).max || supplyIndexRay > type(uint128).max) revert IndexOverflow();
        state.borrowIndexRay = uint128(borrowIndexRay);
        state.supplyIndexRay = uint128(supplyIndexRay);
        state.lastAccrued = uint64(block.timestamp);
        emit InterestAccrued(id, elapsed, borrowIndexRay, supplyIndexRay, utilization);
    }

    function preview(bytes32 id, uint256 totalBorrow, uint256 totalLiquidity)
        external view returns (uint256 borrowIndexRay, uint256 supplyIndexRay)
    {
        IndexState memory state = indexStates[id];
        if (state.lastAccrued == 0) revert NotInitialized();
        uint256 elapsed = block.timestamp - state.lastAccrued;
        (uint256 borrowRate, uint256 supplyRate,) = rateModel.rates(id, totalBorrow, totalLiquidity);
        borrowIndexRay = uint256(state.borrowIndexRay) + uint256(state.borrowIndexRay) * borrowRate * elapsed / RAY;
        supplyIndexRay = uint256(state.supplyIndexRay) + uint256(state.supplyIndexRay) * supplyRate * elapsed / RAY;
    }

    function applySupplyLoss(bytes32 id, uint256 loss, uint256 totalSupply)
        external returns (uint256 supplyIndexRay)
    {
        if (msg.sender != core) revert Unauthorized();
        IndexState storage state = indexStates[id];
        if (state.lastAccrued == 0) revert NotInitialized();
        if (loss == 0 || loss >= totalSupply) revert IndexOverflow();
        supplyIndexRay = uint256(state.supplyIndexRay) * (totalSupply - loss) / totalSupply;
        if (supplyIndexRay == 0 || supplyIndexRay > type(uint128).max) revert IndexOverflow();
        state.supplyIndexRay = uint128(supplyIndexRay);
        emit SupplyLossApplied(id, loss, supplyIndexRay);
    }

    function setCore(address newCore) external onlyOwner {
        if (newCore == address(0)) revert ZeroAddress();
        emit CoreUpdated(core, newCore);
        core = newCore;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
