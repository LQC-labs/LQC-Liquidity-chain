// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IFundingCheckpointSource {
    function fundingLedger() external view returns(address);
    /// Immutable, authenticated Engine must expose one finalized integer accrual per domain/nonce.
    /// Its checkpoint and existing signed remainder commit must share the Ledger transaction.
    function fundingCheckpoint(address account,uint256 market,address token,uint256 nonce) external view returns(int256 amount,bool finalized);
}
interface IFundingCashAdapter {
    function fundingLedger() external view returns(address);
    function vault() external view returns(address);
    function engine() external view returns(address);
    /// Must move actual funded user claims into the real Vault funding pool; no insurance/Treasury.
    function collect(address account,uint256 market,address token,uint256 amount) external;
    /// Must credit only the immutable claim owner with actual reserved pool assets.
    function pay(address account,address token,uint256 amount) external;
}
interface IFundingVaultView {
    function engine() external view returns(address);
    function availableBalance(address,address) external view returns(uint256);
    function lockedBalance(address,address) external view returns(uint256);
    function totalAccounted(address) external view returns(uint256);
    function fundingPoolBalance(address) external view returns(uint256);
    function insuranceFeeReserve(address) external view returns(uint256);
    function treasuryFeeReserve(address) external view returns(uint256);
}
interface IFundingTokenView {function balanceOf(address) external view returns(uint256);}
