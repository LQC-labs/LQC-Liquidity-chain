// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IFundingWithdrawalEngine {
    function fundingLedger() external view returns(address);
    function fundingWithdrawalRequirement(address account,address token) external view returns(uint256);
}
interface IFundingWithdrawalLedger {
    function engine() external view returns(address);function vault() external view returns(address);function adapter() external view returns(address);
    function engineHash() external view returns(bytes32);function vaultHash() external view returns(bytes32);function adapterHash() external view returns(bytes32);
}
