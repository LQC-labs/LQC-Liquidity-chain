// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from './FinanceFixture.sol';
interface VmAdl {function mockCallRevert(address,bytes calldata,bytes calldata) external;function clearMockedCalls() external;}
contract AdlFundingFixTest is FinanceFixture {
    VmAdl constant va=VmAdl(address(uint160(uint256(keccak256('hevm cheat code')))));
    function prep(int256 delta) internal {
        _debtForAdl(false);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,delta);engine.configureAdlSafety(1,true,10000);
    }
    function testGFundedInsuranceAndTreasuryNotUsedForAdlFunding() public {
        engine.configureTradingFee(1,1000,5000);_open(A,1,false,1000e18,5000e18);_open(B,1,true,1000e18,5000e18);engine.configureTradingFee(1,0,0);
        _price(35000e18);_close(B,1);require(vault.residualBadDebt(address(t))==500e18);
        uint256 insurance=vault.insuranceFeeReserve(address(t));uint256 treasury=vault.treasuryFeeReserve(address(t));require(insurance==500e18&&treasury==500e18);
        engine.configureFunding(1,1e25);engine.updateFundingIndex(1,-DELTA);engine.configureAdlSafety(1,true,2500);engine.executeAdl(A,1,1250e18);
        require(vault.insuranceFeeReserve(address(t))==insurance&&vault.treasuryFeeReserve(address(t))==treasury&&vault.totalInsuranceCovered(address(t))==0);
        require(vault.residualBadDebt(address(t))==125e18&&vault.fundingPoolBalance(address(t))==15e18);_assertBooks(t);
    }
    function testGPoolShortagePreservesEverything() public {
        prep(DELTA);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.executeAdl(A,1,1250e18);require(_snapshot()==snap);_assertBooks(t);
    }
    function testGAvailableShortagePreservesEverythingDespiteLockedMargin() public {
        prep(-DELTA);_withdraw(A,t,4000e18);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientAvailableBalance.selector);engine.executeAdl(A,1,5000e18);require(_snapshot()==snap);_assertBooks(t);
    }
    function testGFullAdlPayerSettlesBeforeDeleteWithoutInsurance() public {
        prep(-DELTA);engine.executeAdl(A,1,5000e18);(,,,,bool open)=engine.positions(A,1);require(!open&&engine.positionFundingEntryRay(A,1)==0);require(vault.availableBalance(A,address(t))==4985e18&&vault.fundingPoolBalance(address(t))==15e18);require(vault.residualBadDebt(address(t))==0&&vault.insuranceFeeReserve(address(t))==0);_assertBooks(t);
    }
    function testGFullAdlReceiverSettlesBeforeDelete() public {
        engine.configureFunding(1,1e25);_open(A,1,false,1000e18,5000e18);_open(B,1,true,1000e18,5000e18);engine.updateFundingIndex(1,DELTA);_price(35000e18);_close(B,1);engine.configureAdlSafety(1,true,10000);
        engine.executeAdl(A,1,5000e18);(,,,,bool open)=engine.positions(A,1);require(!open&&vault.availableBalance(A,address(t))==5015e18&&vault.fundingPoolBalance(address(t))==0);_assertBooks(t);
    }
    function testGRepeatedAdlNoDoubleChargeAndNewFundingUsesRemainingSize() public {
        prep(-DELTA);engine.executeAdl(A,1,1250e18);require(engine.previewFundingPayment(A,1)==0);uint256 pool=vault.fundingPoolBalance(address(t));
        engine.executeAdl(A,1,100e18);require(vault.fundingPoolBalance(address(t))==pool);require(vault.residualBadDebt(address(t))==95e18);engine.updateFundingIndex(1,-DELTA);require(engine.previewFundingPayment(A,1)==-1095e16);
        engine.executeAdl(A,1,100e18);require(vault.fundingPoolBalance(address(t))==pool+1095e16&&engine.previewFundingPayment(A,1)==0);_assertBooks(t);
    }
    function testGPostFundingAbsorptionFailureRollsBackAllState() public {
        prep(-DELTA);bytes32 snap=_snapshot();va.mockCallRevert(address(vault),abi.encodeWithSelector(Vault.absorbAdlBadDebt.selector),abi.encodeWithSignature('Error(string)','injected absorption failure'));
        vm.expectRevert();engine.executeAdl(A,1,1250e18);va.clearMockedCalls();require(_snapshot()==snap);_assertBooks(t);
    }
    function testGPostFundingUnlockFailureRollsBackAllState() public {
        prep(-DELTA);bytes32 snap=_snapshot();va.mockCallRevert(address(vault),abi.encodeWithSelector(Vault.unlockCollateral.selector),abi.encodeWithSignature('Error(string)','injected unlock failure'));
        vm.expectRevert();engine.executeAdl(A,1,1250e18);va.clearMockedCalls();require(_snapshot()==snap);_assertBooks(t);
    }
}
