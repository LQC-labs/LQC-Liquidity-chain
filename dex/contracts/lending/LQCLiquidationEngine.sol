// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCLiquidationCore {
    function executeLiquidation(bytes32 id,address account,address payer,address receiver,uint256 requestedRepay)
        external returns(uint256 repaid,uint256 collateralSeized);
}

/// @notice Permissionless entry point for bounded LQC Lending liquidations.
contract LQCLiquidationEngine {
    ILQCLiquidationCore public immutable core;
    event LiquidationExecuted(bytes32 indexed marketId,address indexed account,address indexed liquidator,uint256 repaid,uint256 collateralSeized);
    error ZeroAddress();

    constructor(address core_){if(core_==address(0))revert ZeroAddress();core=ILQCLiquidationCore(core_);}

    function liquidate(bytes32 id,address account,uint256 maxRepay,address receiver)
        external returns(uint256 repaid,uint256 collateralSeized)
    {
        if(receiver==address(0))revert ZeroAddress();
        (repaid,collateralSeized)=core.executeLiquidation(id,account,msg.sender,receiver,maxRepay);
        emit LiquidationExecuted(id,account,msg.sender,repaid,collateralSeized);
    }
}
