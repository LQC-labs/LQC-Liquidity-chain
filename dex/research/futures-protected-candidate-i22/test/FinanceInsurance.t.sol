// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from "./FinanceFixture.sol";
contract FinanceInsuranceTest is FinanceFixture {

    function testFinanceInsuranceFullyCoversCloseDeficit() public {
        _insuredLong(10000,10000);_price(35000e18);_close(A,1);
        require(vault.totalInsuranceCovered(address(t))==500e18&&vault.insuranceFeeReserve(address(t))==0&&vault.residualBadDebt(address(t))==0);_assertBooks(t);
    }
    function testFinanceInsuranceCoverageBoundLeavesResidual() public {
        _insuredLong(10000,5000);_price(35000e18);_close(A,1);
        require(vault.totalInsuranceCovered(address(t))==250e18&&vault.insuranceFeeReserve(address(t))==250e18&&vault.residualBadDebt(address(t))==250e18);_assertBooks(t);
    }
    function testFinanceTreasuryNeverCoversBadDebt() public {
        _insuredLong(5000,10000);_price(35000e18);_close(A,1);
        require(vault.totalInsuranceCovered(address(t))==250e18&&vault.treasuryFeeReserve(address(t))==250e18&&vault.residualBadDebt(address(t))==250e18);_assertBooks(t);
    }
    function testFinanceDisabledInsuranceRecordsWholeDeficit() public {
        _insuredLong(10000,0);_price(35000e18);_close(A,1);
        require(vault.totalInsuranceCovered(address(t))==0&&vault.insuranceFeeReserve(address(t))==500e18&&vault.residualBadDebt(address(t))==500e18);_assertBooks(t);
    }
    function testFinanceLossInsideMarginCreatesNoDebt() public {
        _insuredLong(10000,10000);_price(45000e18);_close(A,1);
        require(vault.residualBadDebt(address(t))==0&&vault.totalInsuranceCovered(address(t))==0&&vault.insuranceFeeReserve(address(t))==500e18);_assertBooks(t);
    }

}

