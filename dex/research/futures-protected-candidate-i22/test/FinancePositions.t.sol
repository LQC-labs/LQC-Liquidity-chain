// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from "./FinanceFixture.sol";
contract FinancePositionsTest is FinanceFixture {

    function testFinanceEntryAndFlatClose() public {
        _open(A,1,true,1000e18,5000e18);require(vault.availableBalance(A,address(t))==4000e18);
        _close(A,1);require(vault.availableBalance(A,address(t))==5000e18&&engine.openInterestUsd(1)==0);_assertBooks(t);
    }
    function testFinanceProfitablePartialReduction() public {
        t.mint(address(vault),2000e18);_open(A,1,true,1000e18,5000e18);_price(55000e18);
        uint256 before_=vault.availableBalance(A,address(t));_reduce(A,1,2000e18);
        (uint256 margin,uint256 size,uint256 entry,bool long_,bool open_)=engine.positions(A,1);
        require(margin==600e18&&size==3000e18&&entry==50000e18&&long_&&open_);
        require(vault.availableBalance(A,address(t))-before_==600e18);_assertBooks(t);
    }
    function testFinanceLosingPartialReduction() public {
        _open(A,1,true,1000e18,5000e18);_price(45000e18);uint256 accounted=vault.totalAccounted(address(t));
        _reduce(A,1,2000e18);require(accounted-vault.totalAccounted(address(t))==200e18);
        (uint256 margin,uint256 size,uint256 entry,,)=engine.positions(A,1);require(margin==600e18&&size==3000e18&&entry==50000e18);_assertBooks(t);
    }
    function testFinanceShortProfitClose() public {
        t.mint(address(vault),2000e18);_open(A,1,false,1000e18,5000e18);_price(45000e18);_close(A,1);
        require(vault.availableBalance(A,address(t))==5500e18);_assertBooks(t);
    }
    function testFinanceFullReductionUsesSamePrimitive() public {
        _open(A,1,true,1000e18,5000e18);_reduce(A,1,5000e18);
        require(vault.availableBalance(A,address(t))==5000e18&&engine.openInterestUsd(1)==0);_assertBooks(t);
    }
    function testFinanceZeroAndExcessReductionRollback() public {
        _open(A,1,true,1000e18,5000e18);bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert();engine.reducePosition(1,0);
        vm.prank(A);vm.expectRevert();engine.reducePosition(1,5001e18);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceDeficitProducingPartialRollback() public {
        _open(A,1,true,1000e18,5000e18);_price(10000e18);bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert(Engine.PartialReductionWouldCreateBadDebt.selector);engine.reducePosition(1,2000e18);
        require(_snapshot()==before_);_assertBooks(t);
    }

}

